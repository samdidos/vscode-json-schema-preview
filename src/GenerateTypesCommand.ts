// F18 — the Generate Types command. Thin VS Code glue over the pure
// typeGenerator: target-language picker, F14 bundling through the same
// auth/cache-backed resolver as the bundle command, cancellable progress,
// and an untitled-editor result. The source file is never modified.
import * as vscode from 'vscode';
import * as fs from 'fs';
import { bundleSchema } from './schemaBundler';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { languageForSchemaSource } from './languages';
import { SchemaAuthManager, AuthRequiredError } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { getRemoteFetchTimeoutMs } from './settings';
import { makeResolver, trackProgress } from './SchemaBundleCommand';
import { generateTypeScript } from './typeGenerator';

interface SchemaSource {
  root: unknown;
  /** Absolute path or URL the schema came from — the base for relative refs. */
  baseId: string;
  /** File stem, the fallback top-level declaration name (F18-FR-07). */
  stem: string;
}

/**
 * `jsonschema.generateTypes` (F18-FR-01). With no argument it reads the
 * active editor's schema; the optional `schemaSource` (absolute path or URL)
 * serves the **Bind Schema…** success-notification entry point, where the
 * active editor is the data file, not the schema.
 */
export function generateTypesCommand(auth: SchemaAuthManager, cache: SchemaCache) {
  return async (schemaSource?: string): Promise<void> => {
    // S02: the F14 bundling step below reads workspace files and the
    // network, so it must be blocked in untrusted workspaces — the same
    // check bundleSchemaCommand makes before running that same step.
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage('Type generation reads workspace files and the network, which is disabled in untrusted workspaces.');
      return;
    }

    const source = typeof schemaSource === 'string'
      ? await loadSchemaSource(schemaSource, auth, cache)
      : loadActiveEditorSchema();
    if (!source) { return; }

    // F18-FR-02: single-select language picker — TypeScript today; further
    // languages are additional items here, no UX change.
    const language = await vscode.window.showQuickPick(
      [{ label: 'TypeScript', description: 'interface / type declarations', id: 'typescript' as const }],
      { title: 'Generate types', placeHolder: 'Choose the target language' },
    );
    if (!language) { return; }

    // F18-FR-06/NFR-01: make the schema self-contained via F14 *before* the
    // engine sees it — this is the only step that may touch disk or network.
    const resolve = makeResolver(auth, cache, source.baseId);
    let code: string | undefined;
    let failure: unknown;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Generating types…', cancellable: true },
      async (progress, token) => {
        try {
          const { schema } = await bundleSchema(source.root, trackProgress(resolve, progress, token));
          code = await generateTypeScript(schema, source.stem);
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
        vscode.window.showErrorMessage(`Type generation failed: ${(failure as Error).message}`);
      }
      return;
    }
    if (code === undefined) { return; }

    const newDoc = await vscode.workspace.openTextDocument({ content: code, language: language.id });
    await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);
  };
}

function loadActiveEditorSchema(): SchemaSource | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isJsonSchemaFile(editor.document)) {
    vscode.window.showInformationMessage('Open a JSON Schema file to generate types from it.');
    return undefined;
  }
  const doc = editor.document;
  const root = parseSchemaText(doc.getText(), doc.languageId);
  if (root === undefined) {
    vscode.window.showErrorMessage('Cannot parse the schema file.');
    return undefined;
  }
  return { root, baseId: doc.uri.fsPath, stem: stemOf(doc.uri.fsPath) };
}

/** Load a schema by reference: remote URLs prefer the local cache and fall
 *  back to an authenticated fetch (the same F07/F08 path the F14 bundling
 *  step uses — F18-NFR-01); local paths are read from disk. */
async function loadSchemaSource(
  ref: string,
  auth: SchemaAuthManager,
  cache: SchemaCache,
): Promise<SchemaSource | undefined> {
  let text: string;
  if (SchemaAuthManager.isRemoteUrl(ref)) {
    try {
      text = cache.readCached(ref) ?? await auth.fetchText(ref, getRemoteFetchTimeoutMs());
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        await SchemaAuthManager.offerConfigureAuth('The schema at', e.url);
      } else {
        vscode.window.showErrorMessage(`Cannot load the schema: ${(e as Error).message}`);
      }
      return undefined;
    }
  } else {
    try {
      text = fs.readFileSync(ref, 'utf-8');
    } catch {
      vscode.window.showErrorMessage(`Cannot read the schema file: ${ref}`);
      return undefined;
    }
  }
  const root = parseSchemaText(text, languageForSchemaSource(ref));
  if (root === undefined) {
    vscode.window.showErrorMessage('Cannot parse the schema file.');
    return undefined;
  }
  return { root, baseId: ref, stem: stemOf(ref) };
}

function stemOf(ref: string): string {
  const base = ref.split(/[\\/]/).pop() ?? ref;
  const noQuery = base.split(/[?#]/)[0];
  return noQuery.replace(/\.[^.]+$/, '') || 'Schema';
}
