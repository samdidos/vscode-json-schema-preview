// F18 — the Generate Types command. Thin VS Code glue over the pure
// typeGenerator: target-language picker (F18-FR-02/10), destination picker
// (F18-FR-11), F14 bundling through the same auth/cache-backed resolver as
// the bundle command, cancellable progress, and an untitled-editor or
// user-chosen-file result. The source schema file is never modified.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { bundleSchema } from './schemaBundler';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { languageForSchemaSource } from './languages';
import { SchemaAuthManager, AuthRequiredError } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { getRemoteFetchTimeoutMs } from './settings';
import { makeResolver, trackProgress } from './SchemaBundleCommand';
import { generateCode, TARGET_LANGUAGES, type TargetLanguage } from './typeGenerator';

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

    // F18-FR-02/10: single-select language picker over the supported targets.
    const language = await vscode.window.showQuickPick(
      TARGET_LANGUAGES.map(t => ({ label: t.label, description: `.${t.extension}`, id: t.id, target: t })),
      { title: 'Generate types', placeHolder: 'Choose the target language' },
    );
    if (!language) { return; }
    const target = language.target;

    // F18-FR-11: destination — untitled editor (default) or a file the user
    // picks in the save dialog.
    const destination = await vscode.window.showQuickPick(
      [
        { label: 'Open in a new editor', description: 'untitled document — save it wherever you like', id: 'untitled' as const },
        { label: 'Save to a file…', description: `choose where ${source.stem}.${target.extension} goes; opens after saving`, id: 'file' as const },
      ],
      { title: 'Generate types', placeHolder: 'Where should the generated code go?' },
    );
    if (!destination) { return; }

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
          code = await generateCode(schema, source.stem, target);
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

    if (destination.id === 'file') {
      const saved = await saveGeneratedFile(code, source, target);
      if (saved) { return; }
      // Save dialog cancelled — fall back to an untitled editor so the
      // generated output is never silently lost (F18-FR-11).
    }
    await openUntitled(code, target);
  };
}

/** Opens the generated code as an untitled document with the target's editor
 *  language, falling back to plain text when the running VS Code does not
 *  know the language id (e.g. Kotlin/Dart without their extensions) —
 *  F18-FR-02. */
async function openUntitled(code: string, target: TargetLanguage): Promise<void> {
  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument({ content: code, language: target.editorLanguageId });
  } catch {
    doc = await vscode.workspace.openTextDocument({ content: code, language: 'plaintext' });
  }
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}

/** F18-FR-11: native save dialog pre-filled with `<stem>.<ext>` next to the
 *  schema (first workspace folder for remote schemas); writes and opens the
 *  file. Returns false when the user cancels the dialog. */
async function saveGeneratedFile(
  code: string,
  source: SchemaSource,
  target: TargetLanguage,
): Promise<boolean> {
  const defaultDir = SchemaAuthManager.isRemoteUrl(source.baseId)
    ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    : path.dirname(source.baseId);
  const uri = await vscode.window.showSaveDialog({
    defaultUri: defaultDir
      ? vscode.Uri.file(path.join(defaultDir, `${source.stem}.${target.extension}`))
      : undefined,
    filters: { [target.label]: [target.extension] },
  });
  if (!uri) { return false; }
  await fs.promises.writeFile(uri.fsPath, code, 'utf-8');
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  return true;
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
