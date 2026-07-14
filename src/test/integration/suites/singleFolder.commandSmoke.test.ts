// S08-SR-06 — one smoke test per user-facing command in
// package.json#contributes.commands: execute it against a fixture and assert
// it neither throws nor leaves an error notification. Where a command's real
// success path would need the network (schemaCache.download, Python
// subprocess installs) or a modal native dialog with no scriptable default
// (showOpenDialog), the test exercises the closest safe path instead —
// either the built-in/offline branch (jsonschema.preview forced to the
// dependency-free renderer) or the documented no-precondition-met branch,
// which is still a real, deterministic run of the command's handler that
// would fail this test if it threw or reported an error (see per-command
// comments below). This keeps the suite offline and fast per S08-NFR-02.
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { withQuickPick, withCapturedMessages, writeFile, closeAllEditors, openDocument, FIXTURES_ROOT } from '../helpers';

const FIXTURE = path.join(FIXTURES_ROOT, 'single-folder');
const SETTINGS_PATH = path.join(FIXTURE, '.vscode', 'settings.json');
const CONFIG_PATH = path.join(FIXTURE, '.json-schema-preview-config.json');
const DATA_JSON_PATH = path.join(FIXTURE, 'data.json');
const DATA_JSON_ORIGINAL = '{\n  "name": "example"\n}\n';

function schemaUri(): vscode.Uri {
  return vscode.Uri.file(path.join(FIXTURE, 'schema.json'));
}

function resetWorkspaceFolderSettings(): void {
  writeFile(SETTINGS_PATH, '{}\n');
}

async function resetPreviewRendererConfig(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
  await cfg.update('renderer', undefined, vscode.ConfigurationTarget.Workspace);
}

function removeConfigFileIfPresent(): void {
  try { fs.unlinkSync(CONFIG_PATH); } catch { /* not created by this run */ }
}

function assertNoErrors(errors: string[], label: string): void {
  assert.deepStrictEqual(errors, [], `${label}: expected no error notification, got ${JSON.stringify(errors)}`);
}

suite('[S08-SR-06] Command smoke tests — one per contributed command', () => {
  setup(async () => {
    resetWorkspaceFolderSettings();
    writeFile(DATA_JSON_PATH, DATA_JSON_ORIGINAL);
    await closeAllEditors();
  });
  teardown(async () => {
    await resetPreviewRendererConfig();
    resetWorkspaceFolderSettings();
    writeFile(DATA_JSON_PATH, DATA_JSON_ORIGINAL);
    removeConfigFileIfPresent();
    await closeAllEditors();
  });

  test('[S08-SR-06] jsonschema.preview renders the fixture schema with the built-in renderer (no Python/network)', async () => {
    // Force the dependency-free fallback renderer (F01-FR-27) so this smoke
    // test never shells out to Python or attempts a `pip install` (S08-NFR-02).
    await vscode.workspace.getConfiguration('jsonschema.preview')
      .update('renderer', 'builtin', vscode.ConfigurationTarget.Workspace);
    const { errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.preview', schemaUri()) as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.preview');
  });

  test('[S08-SR-06] jsonschema.edit opens the visual schema editor for the fixture schema', async () => {
    const { errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.edit', schemaUri()) as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.edit');
  });

  test('[S08-SR-06] jsonschema.configure opens the render-config file', async () => {
    const { errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.configure') as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.configure');
  });

  test('[S08-SR-06] jsonschema.openConfig opens the render-config file', async () => {
    const { errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.openConfig') as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.openConfig');
  });

  // Real success requires a bound remote schema URL and interactive auth-type
  // prompts (showQuickPick/showInputBox) on top of that; the argument-less,
  // no-active-URL branch below is the deterministic, offline slice of this
  // command's behaviour a smoke test can exercise safely.
  test('[S08-SR-06] jsonschema.configureSchemaAuth is a clean no-op with no bound remote schema', async () => {
    const { errors, info } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.configureSchemaAuth') as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.configureSchemaAuth');
    assert.ok(info.length > 0, 'expected an informational message explaining nothing was found to configure');
  });

  // Real success calls schemaCache.download(url), a genuine HTTP fetch — see
  // singleFolder.remoteSchema.test.ts for that path against the local fixture
  // HTTP server. Here we only exercise the no-URL branch, which never touches
  // the network.
  test('[S08-SR-06] jsonschema.cacheSchemaLocally is a clean no-op with no schema URL available', async () => {
    const { errors, info } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.cacheSchemaLocally') as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.cacheSchemaLocally');
    assert.ok(info.length > 0, 'expected an informational message explaining nothing was found to cache');
  });

  test('[S08-SR-06] jsonschema.refreshSchemaCache is a clean no-op with nothing cached', async () => {
    const { errors, info } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.refreshSchemaCache') as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.refreshSchemaCache');
    assert.ok(info.length > 0, 'expected an informational message explaining nothing was found to refresh');
  });

  test('[S08-SR-06] jsonschema.bundleSchema bundles the fixture schema', async () => {
    await openDocument(schemaUri().fsPath);
    const { errors } = await withQuickPick(
      items => items.find((i: any) => i.id === 'bundle'),
      () => withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.bundleSchema') as Promise<void>,
      ),
    );
    assertNoErrors(errors, 'jsonschema.bundleSchema');
  });

  test('[S08-SR-06] jsonschema.generateTypes generates types from the fixture schema', async () => {
    await openDocument(schemaUri().fsPath);
    const { errors } = await withQuickPick(
      (items, call) => (call === 0 ? items[0] : items.find((i: any) => i.id === 'untitled')),
      () => withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.generateTypes') as Promise<void>,
      ),
    );
    assertNoErrors(errors, 'jsonschema.generateTypes');
  });

  test('[S08-SR-06] jsonschema.inferSchema infers a schema from the fixture data file', async () => {
    await openDocument(DATA_JSON_PATH);
    const { errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.inferSchema') as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.inferSchema');
  });

  test('[S08-SR-06] jsonschema.generateSampleData generates sample data from the fixture schema', async () => {
    await openDocument(schemaUri().fsPath);
    const { errors } = await withQuickPick(
      items => items.find((i: any) => i.id === 'json'),
      () => withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.generateSampleData') as Promise<void>,
      ),
    );
    assertNoErrors(errors, 'jsonschema.generateSampleData');
  });

  test('[S08-SR-06] jsonschema.diffSchema cancels cleanly on baseline picker dismissal', async () => {
    await openDocument(schemaUri().fsPath);
    const { errors } = await withQuickPick(
      () => undefined, // dismiss the baseline picker — avoids the Workspace-file/Remote-URL branches, which need an unstubbed native dialog or a real fetch respectively
      () => withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.diffSchema') as Promise<void>,
      ),
    );
    assertNoErrors(errors, 'jsonschema.diffSchema');
  });

  test('[S08-SR-06] jsonschema.migrateDraft migrates the fixture schema to another draft', async () => {
    await openDocument(schemaUri().fsPath);
    // The fixture schema is draft-07; migrating to 2020-12 changes $schema and
    // opens the result in a new editor — a real, offline run of the handler.
    const { errors } = await withQuickPick(
      items => items.find((i: any) => i.id === '2020-12'),
      () => withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.migrateDraft') as Promise<void>,
      ),
    );
    assertNoErrors(errors, 'jsonschema.migrateDraft');
  });

  test('[S08-SR-06] jsonschema.lint.insertSchemaDeclaration inserts a $schema declaration into the fixture data file', async () => {
    await openDocument(DATA_JSON_PATH);
    const { errors } = await withQuickPick(
      items => items[0], // DRAFTS is a plain string[] — the picker resolves to whichever draft URI is items[0]
      () => withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.lint.insertSchemaDeclaration') as Promise<void>,
      ),
    );
    assertNoErrors(errors, 'jsonschema.lint.insertSchemaDeclaration');
  });

  test('[S08-SR-06] jsonschema.validateWorkspace validates the fixture workspace end to end', async () => {
    const { errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.validateWorkspace') as Promise<void>,
    );
    assertNoErrors(errors, 'jsonschema.validateWorkspace');
  });
});
