// F14 — the bundle/dereference command. Thin VS Code glue over the pure
// schemaBundler: mode picker, an auth/cache-backed async resolver, cancellable
// progress, and an untitled-editor result. The source file is never modified.
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { bundleSchema, dereferenceSchema, type ResolvedDoc } from './schemaBundler';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { isYaml } from './languages';
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
        const action = await vscode.window.showErrorMessage(
          `A referenced schema at ${SchemaAuthManager.hostOf(failure.url)} requires authentication.`,
          'Configure Auth',
        );
        if (action === 'Configure Auth') {
          void vscode.commands.executeCommand('jsonschema.configureSchemaAuth', failure.url);
        }
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

/** Wrap a resolver so each fetched document reports progress and honours cancellation. */
function trackProgress(
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
 */
export function makeResolver(auth: SchemaAuthManager, cache: SchemaCache, rootFsPath: string) {
  return async (uri: string, baseId: string): Promise<ResolvedDoc> => {
    const base = baseId || rootFsPath;
    if (SchemaAuthManager.isRemoteUrl(uri)) {
      const cached = cache.readCached(uri);
      const text = cached ?? await auth.fetchText(uri, getRemoteFetchTimeoutMs());
      return { id: uri, schema: parseSchemaText(text, langForUri(uri)) ?? {}, keyHint: keyHintFor(uri) };
    }
    // Relative to the referring document's directory.
    const baseDir = SchemaAuthManager.isRemoteUrl(base) ? base : path.dirname(base);
    if (SchemaAuthManager.isRemoteUrl(base)) {
      const resolved = new URL(uri, base).toString();
      const cached = cache.readCached(resolved);
      const text = cached ?? await auth.fetchText(resolved, getRemoteFetchTimeoutMs());
      return { id: resolved, schema: parseSchemaText(text, langForUri(resolved)) ?? {}, keyHint: keyHintFor(resolved) };
    }
    const filePath = path.resolve(baseDir, uri);
    let text: string;
    try {
      text = fs.readFileSync(filePath, 'utf-8');
    } catch {
      throw new Error(`Cannot resolve $ref "${uri}" (looked for ${filePath}).`);
    }
    return { id: filePath, schema: parseSchemaText(text, langForUri(filePath)) ?? {}, keyHint: keyHintFor(filePath) };
  };
}

function langForUri(uri: string): string {
  const ext = uri.split('#')[0].split('.').pop()?.toLowerCase();
  return ext === 'yaml' || ext === 'yml' ? 'yaml' : 'json';
}

function keyHintFor(uri: string): string {
  const stem = uri.split('#')[0].split(/[\\/]/).pop() ?? uri;
  return stem.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_') || 'schema';
}
