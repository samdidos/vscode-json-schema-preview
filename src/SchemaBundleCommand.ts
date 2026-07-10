// F14 — the bundle/dereference command. Thin VS Code glue over the pure
// schemaBundler: mode picker, an auth/cache-backed async resolver, cancellable
// progress, and an untitled-editor result. The source file is never modified.
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { bundleSchema, dereferenceSchema, type ResolvedDoc } from './schemaBundler';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { isYaml, languageForSchemaSource } from './languages';
import { SchemaAuthManager, AuthRequiredError } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { getRemoteFetchTimeoutMs } from './settings';

type Mode = 'bundle' | 'dereference';

export function bundleSchemaCommand(auth: SchemaAuthManager, cache: SchemaCache) {
  return async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isJsonSchemaFile(editor.document)) {
      vscode.window.showInformationMessage('Open a JSON Schema file to bundle it.');
      return;
    }
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage('Schema bundling reads workspace files and the network, which is disabled in untrusted workspaces.');
      return;
    }
    const doc = editor.document;
    const root = parseSchemaText(doc.getText(), doc.languageId);
    if (root === undefined) {
      vscode.window.showErrorMessage('Cannot parse the schema file.');
      return;
    }

    const modePick = await vscode.window.showQuickPick(
      [
        { label: 'Bundle (refs → $defs)', detail: 'Pull external schemas into $defs and rewrite refs — round-trippable', id: 'bundle' as const },
        { label: 'Dereference (inline)', detail: 'Replace refs with their target inline — maximally portable; cycles kept as $defs refs', id: 'dereference' as const },
      ],
      { title: 'Bundle schema', placeHolder: 'Choose how to flatten the schema' },
    );
    if (!modePick) { return; }
    const mode: Mode = modePick.id;

    const resolve = makeResolver(auth, cache, doc.uri.fsPath);

    let result: { schema: unknown; strippedIds: string[] } | undefined;
    let failure: unknown;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Bundling schema…', cancellable: true },
      async (progress, token) => {
        const tracked = trackProgress(resolve, progress, token);
        try {
          result = mode === 'bundle'
            ? await bundleSchema(root, tracked)
            : await dereferenceSchema(root, tracked);
        } catch (e) {
          failure = e;
        }
      },
    );

    if (failure) {
      if (failure instanceof AuthRequiredError) {
        await SchemaAuthManager.offerConfigureAuth('A referenced schema at', failure.url);
      } else if ((failure as Error).name === 'Canceled' || (failure as Error).message === 'Canceled') {
        /* user cancelled — no message */
      } else {
        vscode.window.showErrorMessage(`Bundling failed: ${(failure as Error).message}`);
      }
      return;
    }
    if (!result) { return; }

    const language = isYaml(doc.languageId) ? 'yaml' : 'json';
    const content = language === 'yaml'
      ? (await import('yaml')).stringify(result.schema)
      : JSON.stringify(result.schema, null, 2);
    const newDoc = await vscode.workspace.openTextDocument({ content, language });
    await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);

    if (result.strippedIds.length) {
      vscode.window.showInformationMessage(
        `Schema ${mode === 'bundle' ? 'bundled' : 'dereferenced'}. Removed ${result.strippedIds.length} nested "$id" keyword(s) from inlined content to keep resolution unambiguous.`,
      );
    } else {
      vscode.window.showInformationMessage(`Schema ${mode === 'bundle' ? 'bundled' : 'dereferenced'}.`);
    }
  };
}

/** Wrap a resolver so each fetched document reports progress and honours
 *  cancellation. Shared with the F18 Generate Types command, which runs the
 *  same F14 resolution step before code generation. */
export function trackProgress(
  resolve: ReturnType<typeof makeResolver>,
  progress: vscode.Progress<{ message?: string }>,
  token: vscode.CancellationToken,
): ReturnType<typeof makeResolver> {
  return async (uri, baseId) => {
    if (token.isCancellationRequested) {
      const e = new Error('Canceled'); e.name = 'Canceled'; throw e;
    }
    progress.report({ message: uri });
    return resolve(uri, baseId);
  };
}

/**
 * Build the document resolver: relative refs read from disk, remote refs prefer
 * the local cache then fetch with auth (F14-FR-04). `baseId` is the referring
 * document's absolute path or URL; the returned `id` canonicalises the target.
 * `keyHint` is deliberately left unset — schemaBundler's own `deriveKey` derives
 * it from the resolved schema's `$id` first, falling back to the ref/filename
 * (F14-FR-05); setting a filename-only hint here would always take priority
 * over `deriveKey` and so silently defeat the `$id` preference.
 */
export function makeResolver(auth: SchemaAuthManager, cache: SchemaCache, rootFsPath: string) {
  // Keyed by the resolved target id (computeTargetId), not by (uri, baseId) —
  // several $refs across a schema commonly point at the same external
  // document, and without this each occurrence would re-read/re-fetch and
  // re-parse it. Caches the in-flight promise (not just the settled result)
  // so concurrent refs to the same target awaiting resolution share one fetch.
  const inFlight = new Map<string, Promise<ResolvedDoc>>();

  async function fetchAndParse(id: string, uri: string): Promise<ResolvedDoc> {
    if (SchemaAuthManager.isRemoteUrl(id)) {
      const cached = cache.readCached(id);
      const text = cached ?? await auth.fetchText(id, getRemoteFetchTimeoutMs());
      return { id, schema: parseSchemaText(text, languageForSchemaSource(id)) ?? {} };
    }
    let text: string;
    try {
      text = fs.readFileSync(id, 'utf-8');
    } catch {
      throw new Error(`Cannot resolve $ref "${uri}" (looked for ${id}).`);
    }
    return { id, schema: parseSchemaText(text, languageForSchemaSource(id)) ?? {} };
  }

  return (uri: string, baseId: string): Promise<ResolvedDoc> => {
    const base = baseId || rootFsPath;
    const id = computeTargetId(uri, base);
    let pending = inFlight.get(id);
    if (!pending) {
      pending = fetchAndParse(id, uri);
      inFlight.set(id, pending);
      // A transient failure (network blip) shouldn't permanently poison every
      // other $ref into the same document for the rest of this bundle run.
      pending.catch(() => inFlight.delete(id));
    }
    return pending;
  };
}

/** The canonical id a `$ref`'s `uri` part resolves to against `base` (the
 *  referring document's absolute path or URL) — remote refs by themselves,
 *  relative refs resolved against a remote base as an absolute URL, and
 *  relative refs resolved against a local base as an absolute file path. */
function computeTargetId(uri: string, base: string): string {
  if (SchemaAuthManager.isRemoteUrl(uri)) { return uri; }
  if (SchemaAuthManager.isRemoteUrl(base)) { return new URL(uri, base).toString(); }
  return path.resolve(path.dirname(base), uri);
}
