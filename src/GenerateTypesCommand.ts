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
import {
  generateCodeFiles,
  concatenateGeneratedFiles,
  TARGET_LANGUAGES,
  type TargetLanguage,
} from './typeGenerator';

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
    let files: Map<string, string> | undefined;
    let failure: unknown;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Generating types…', cancellable: true },
      async (progress, token) => {
        try {
          const { schema } = await bundleSchema(source.root, trackProgress(resolve, progress, token));
          files = await generateCodeFiles(schema, source.stem, target);
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
    if (files === undefined) { return; }

    if (destination.id === 'file') {
      // F18-FR-10/11: Java emits one file per class, so its destination is a
      // folder written file-by-file; every other target saves a single file.
      const saved = files.size > 1
        ? await saveGeneratedFolder(files, source, target)
        : await saveGeneratedFile(concatenateGeneratedFiles(files, target), source, target);
      if (saved) { return; }
      // Dialog cancelled or overwrite declined — fall back to an untitled
      // editor so the generated output is never silently lost (F18-FR-11).
    }
    await openUntitled(concatenateGeneratedFiles(files, target), target);
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

/** The directory the destination dialogs default to: next to the schema, or
 *  the first workspace folder when the schema is remote (F18-FR-11). */
function defaultDirFor(source: SchemaSource): string | undefined {
  return SchemaAuthManager.isRemoteUrl(source.baseId)
    ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    : path.dirname(source.baseId);
}

/** F18-FR-11 (single-file targets): native save dialog pre-filled with
 *  `<stem>.<ext>` in the default directory; writes and opens the file.
 *  Returns false when the user cancels the dialog. */
async function saveGeneratedFile(
  code: string,
  source: SchemaSource,
  target: TargetLanguage,
): Promise<boolean> {
  const defaultDir = defaultDirFor(source);
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

/** F18-FR-11 (multi-file targets, i.e. Java): native directory picker;
 *  writes every emitted file under its engine-given name — never
 *  overwriting existing files without an explicit confirmation — and opens
 *  the top-level file (quicktype lists it first). Returns false when the
 *  user cancels the dialog or declines the overwrite. */
async function saveGeneratedFolder(
  files: Map<string, string>,
  source: SchemaSource,
  target: TargetLanguage,
): Promise<boolean> {
  const defaultDir = defaultDirFor(source);
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: `Save ${files.size} ${target.label} files here`,
    defaultUri: defaultDir ? vscode.Uri.file(defaultDir) : undefined,
  });
  const folder = picked?.[0]?.fsPath;
  if (!folder) { return false; }

  // Overwrite guard (F18-FR-11) — a courtesy confirmation for the user's
  // benefit, not a security boundary (the write below is user-approved
  // either way, so a racing file appearing in between is not a concern).
  const existing = [...files.keys()].filter(name => fs.existsSync(path.join(folder, name)));
  if (existing.length > 0) {
    const choice = await vscode.window.showWarningMessage(
      `${existing.length} of the ${files.size} generated file(s) already exist in ${folder}: ${existing.join(', ')}. Overwrite?`,
      'Overwrite',
      'Cancel',
    );
    if (choice !== 'Overwrite') { return false; }
  }

  for (const [name, content] of files) {
    await fs.promises.writeFile(path.join(folder, name), content, 'utf-8');
  }
  const mainName = files.keys().next().value;
  if (mainName !== undefined) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(folder, mainName)));
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }
  vscode.window.showInformationMessage(`Wrote ${files.size} files to ${folder}.`);
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
