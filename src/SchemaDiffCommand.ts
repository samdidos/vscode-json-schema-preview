// F15 — the diff command. Picks a baseline (Git HEAD via the built-in git
// extension API, a workspace file, or a remote URL through auth), runs the pure
// classifier, and shows the result as a read-only virtual Markdown document
// (spec Q1) plus a one-line summary notification.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { diffSchemas, renderReport, summaryLine } from './schemaDiff';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { SchemaAuthManager, AuthRequiredError } from './SchemaAuthManager';
import { getRemoteFetchTimeoutMs } from './settings';

const SCHEME = 'jsonschema-diff';

/** Register the read-only report content provider and the diff command. */
export function registerSchemaDiff(context: vscode.ExtensionContext, auth: SchemaAuthManager): void {
  const reports = new Map<string, string>();
  let seq = 0;

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
      provideTextDocumentContent: (uri: vscode.Uri) => reports.get(uri.toString()) ?? '',
    }),
    vscode.commands.registerCommand('jsonschema.diffSchema', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isJsonSchemaFile(editor.document)) {
        vscode.window.showInformationMessage('Open a JSON Schema file to diff it.');
        return;
      }
      const doc = editor.document;
      const newSchema = parseSchemaText(doc.getText(), doc.languageId);
      if (newSchema === undefined) {
        vscode.window.showErrorMessage('Cannot parse the current schema file.');
        return;
      }

      const baseline = await pickBaseline(doc, auth);
      if (!baseline) { return; }
      const oldSchema = parseSchemaText(baseline.text, doc.languageId);
      if (oldSchema === undefined) {
        vscode.window.showErrorMessage(`Cannot parse the baseline schema (${baseline.label}).`);
        return;
      }

      const entries = diffSchemas(oldSchema, newSchema);
      if (entries.length === 0) {
        vscode.window.showInformationMessage(`No structural changes between ${baseline.label} and the current schema.`);
        return;
      }

      const header = `${path.basename(doc.uri.fsPath)} vs ${baseline.label}`;
      const content = renderReport(entries, header);
      const uri = vscode.Uri.parse(`${SCHEME}:Schema Diff ${++seq}.md`);
      reports.set(uri.toString(), content);

      const action = await vscode.window.showInformationMessage(
        `Schema diff: ${summaryLine(entries)}.`,
        'Open report',
      );
      if (action === 'Open report') {
        const reportDoc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(reportDoc, { preview: true });
      }
    }),
  );
}

interface Baseline { text: string; label: string; }

async function pickBaseline(doc: vscode.TextDocument, auth: SchemaAuthManager): Promise<Baseline | undefined> {
  const headText = await gitHeadContent(doc);

  type Item = vscode.QuickPickItem & { id: 'head' | 'file' | 'url' };
  const items: Item[] = [];
  if (headText !== undefined) {
    items.push({ label: '$(git-commit) Git HEAD', description: 'the last committed version of this file', id: 'head' });
  }
  items.push(
    { label: '$(file) Workspace file…', description: 'pick another schema file to compare against', id: 'file' },
    { label: '$(globe) Remote URL…', description: 'fetch a published schema to compare against', id: 'url' },
  );

  const pick = await vscode.window.showQuickPick(items, { title: 'Diff against which baseline?' });
  if (!pick) { return undefined; }

  if (pick.id === 'head') {
    return { text: headText!, label: 'Git HEAD' };
  }
  if (pick.id === 'file') {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON Schema': ['json', 'yaml', 'yml'] },
      title: 'Select the baseline schema',
    });
    if (!uris?.length) { return undefined; }
    try {
      return { text: fs.readFileSync(uris[0].fsPath, 'utf-8'), label: path.basename(uris[0].fsPath) };
    } catch (e) {
      vscode.window.showErrorMessage(`Cannot read baseline: ${(e as Error).message}`);
      return undefined;
    }
  }
  // Remote URL
  const url = await vscode.window.showInputBox({
    title: 'Baseline schema URL',
    placeHolder: 'https://example.com/schema.json',
    prompt: 'Enter the URL of the published schema to compare against',
  });
  if (!url) { return undefined; }
  try {
    const text = await auth.fetchText(url.trim(), getRemoteFetchTimeoutMs());
    return { text, label: SchemaAuthManager.hostOf(url) };
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      const action = await vscode.window.showErrorMessage(
        `Baseline at ${SchemaAuthManager.hostOf(e.url)} requires authentication.`,
        'Configure Auth',
      );
      if (action === 'Configure Auth') {
        void vscode.commands.executeCommand('jsonschema.configureSchemaAuth', e.url);
      }
    } else {
      vscode.window.showErrorMessage(`Cannot fetch baseline: ${(e as Error).message}`);
    }
    return undefined;
  }
}

/**
 * The file's content at Git HEAD via the built-in git extension API (F15-FR-03),
 * or undefined when git or a committed version is unavailable (option hidden).
 */
async function gitHeadContent(doc: vscode.TextDocument): Promise<string | undefined> {
  try {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt) { return undefined; }
    if (!gitExt.isActive) { await gitExt.activate(); }
    const api = gitExt.exports?.getAPI?.(1);
    const repo = api?.getRepository?.(doc.uri);
    if (!repo) { return undefined; }
    return await repo.show('HEAD', doc.uri.fsPath);
  } catch {
    return undefined;
  }
}
