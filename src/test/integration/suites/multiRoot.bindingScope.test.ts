// S08-SR-04 — settings-scope round-trip matrix, multi-root workspace half:
// Workspace scope (folder-prefixed fileMatch, shared across all folders) and
// the cross-folder WorkspaceFolder-scope case — a schema in one project
// folder bound to a data file in a *different* one — which is exactly the
// real bug the F04-FR-13/F04-FR-14 fixes earlier in this codebase's history
// were written to catch. A mocked-vscode unit test cannot exercise this at
// all (see S08's rationale): this suite runs against the real settings
// resolution VS Code itself performs.
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { withQuickPick, withCapturedMessages, readJsonFile, writeFile, closeAllEditors, FIXTURES_ROOT } from '../helpers';

const ROOT = path.join(FIXTURES_ROOT, 'multi-root');
const PROJ_A = path.join(ROOT, 'projA');
const PROJ_B = path.join(ROOT, 'projB');
const WORKSPACE_FILE = path.join(ROOT, 'multi-root.code-workspace');
const PROJ_A_SETTINGS = path.join(PROJ_A, '.vscode', 'settings.json');

function resetWorkspaceFileSettings(): void {
  writeFile(WORKSPACE_FILE, JSON.stringify({
    folders: [{ path: 'projA' }, { path: 'projB' }],
    settings: {},
  }, null, 2) + '\n');
}

function resetProjASettings(): void {
  writeFile(PROJ_A_SETTINGS, '{}\n');
}

async function bindActiveFile(schemaBasename: string, target: vscode.ConfigurationTarget): Promise<void> {
  await withQuickPick(
    (items, call) => {
      if (call === 0) { return items.find((i: any) => i.uri?.fsPath?.endsWith(schemaBasename)); }
      return items.find((i: any) => i.target === target);
    },
    () => withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.bindToCurrentFile') as Promise<void>,
    ),
  );
}

async function openDataFile(): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(PROJ_A, 'data.json')));
  await vscode.window.showTextDocument(doc);
  return doc;
}

suite('[S08-SR-04] Binding scope matrix — multi-root workspace', () => {
  setup(async () => {
    resetWorkspaceFileSettings();
    resetProjASettings();
    await closeAllEditors();
  });
  teardown(async () => {
    resetWorkspaceFileSettings();
    resetProjASettings();
    await closeAllEditors();
  });

  test('[S08-SR-04][F04-FR-13] Workspace scope: folder-prefixed fileMatch, absolute schema path across folders', async () => {
    await openDataFile();
    await bindActiveFile('schema.json', vscode.ConfigurationTarget.Workspace);

    const ws = readJsonFile(WORKSPACE_FILE);
    const entries: any[] = ws.settings?.['json.schemas'] ?? [];
    const entry = entries.find(e => e.fileMatch?.some((p: string) => p.endsWith('projA/data.json') || p.endsWith('projA\\data.json')));
    assert.ok(entry, `expected a folder-prefixed fileMatch entry for projA/data.json in ${JSON.stringify(ws.settings)}`);
    assert.ok(path.isAbsolute(entry.url), `expected an absolute schema path since projB is a different folder, got ${entry.url}`);
    assert.ok(entry.url.endsWith('schema.json'));
  });

  test(
    '[S08-SR-04][F04-FR-13][F04-FR-14] WorkspaceFolder scope: absolute path for a cross-folder schema, ' +
    'and the extension\'s own reader (not just VS Code\'s) recognises the binding',
    async () => {
      await openDataFile();
      await bindActiveFile('schema.json', vscode.ConfigurationTarget.WorkspaceFolder);

      // Write side (F04-FR-13): must be the absolute path, never a './'-relative
      // one — a relative path here would resolve against projA (the data file's
      // own folder) and silently point at a nonexistent projA/schema.json.
      const settings = readJsonFile(PROJ_A_SETTINGS);
      const entry = (settings['json.schemas'] ?? []).find((e: any) => e.fileMatch?.includes('data.json'));
      assert.ok(entry, 'expected a json.schemas entry in projA/.vscode/settings.json');
      assert.ok(
        path.isAbsolute(entry.url),
        `a schema in a different workspace folder must be stored as an absolute path, got ${entry.url}`
      );
      assert.strictEqual(entry.url, path.join(PROJ_B, 'schema.json'));

      // Read side (F04-FR-14): the extension's own validator must resolve this
      // WorkspaceFolder-scoped, cross-folder binding — this is the exact
      // read-path regression findBoundSchemaPath's resource-scoping fix covers.
      const { info, warnings, errors } = await withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.validateFile') as Promise<void>,
      );
      assert.ok(
        !warnings.some(w => w.includes('No schema bound')),
        `expected the validator to recognise the cross-folder binding (warnings: ${JSON.stringify(warnings)})`
      );
      assert.ok(
        info.some(m => m.includes('is valid against')),
        `expected a successful validation message (got info: ${JSON.stringify(info)}, warnings: ${JSON.stringify(warnings)}, errors: ${JSON.stringify(errors)})`
      );
    },
  );
});
