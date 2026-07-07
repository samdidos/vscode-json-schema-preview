// S08-SR-04 — settings-scope round-trip matrix, single-folder workspace half:
// WorkspaceFolder and Global scope for both JSON and YAML data files. (The
// Workspace-scope and cross-folder cases need a .code-workspace file and a
// second folder, so they live in multiRoot.bindingScope.test.ts instead —
// there is no "Workspace" scope option at all without one, matching F04-FR-02.)
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { withQuickPick, withCapturedMessages, readJsonFile, writeFile, closeAllEditors, FIXTURES_ROOT } from '../helpers';

const FIXTURE = path.join(FIXTURES_ROOT, 'single-folder');
const SETTINGS_PATH = path.join(FIXTURE, '.vscode', 'settings.json');

function resetWorkspaceFolderSettings(): void {
  writeFile(SETTINGS_PATH, '{}\n');
}

async function resetGlobalConfig(section: 'json' | 'yaml'): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(section);
  await cfg.update('schemas', undefined, vscode.ConfigurationTarget.Global);
}

async function bindActiveFile(schemaBasename: string, target: vscode.ConfigurationTarget): Promise<void> {
  await withQuickPick(
    (items, call) => {
      if (call === 0) { return items.find((i: any) => i.uri?.fsPath?.endsWith(schemaBasename)); }
      return items.find((i: any) => i.target === target);
    },
    () => vscode.commands.executeCommand('jsonschema.bindToCurrentFile') as Promise<void>,
  );
}

async function openFixtureFile(basename: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(FIXTURE, basename)));
  await vscode.window.showTextDocument(doc);
  return doc;
}

async function assertValidatorRecognisesBinding(basename: string): Promise<void> {
  await openFixtureFile(basename);
  const { info, warnings } = await withCapturedMessages(
    () => vscode.commands.executeCommand('jsonschema.validateFile') as Promise<void>,
  );
  assert.ok(
    !warnings.some(w => w.includes('No schema bound')),
    `expected the validator to recognise the binding for ${basename}, but it reported no schema bound (warnings: ${JSON.stringify(warnings)})`
  );
  assert.ok(
    info.some(m => m.includes('is valid against')),
    `expected a successful validation message for ${basename} (got info: ${JSON.stringify(info)})`
  );
}

suite('[S08-SR-04] Binding scope matrix — single-folder workspace', () => {
  setup(async () => {
    resetWorkspaceFolderSettings();
    await resetGlobalConfig('json');
    await resetGlobalConfig('yaml');
    await closeAllEditors();
  });
  teardown(async () => {
    resetWorkspaceFolderSettings();
    await resetGlobalConfig('json');
    await resetGlobalConfig('yaml');
    await closeAllEditors();
  });

  test('[S08-SR-04] WorkspaceFolder scope + JSON: folder-relative fileMatch, validator recognises it', async () => {
    await openFixtureFile('data.json');
    await bindActiveFile('schema.json', vscode.ConfigurationTarget.WorkspaceFolder);

    const settings = readJsonFile(SETTINGS_PATH);
    const entry = (settings['json.schemas'] ?? []).find((e: any) => e.fileMatch?.includes('data.json'));
    assert.ok(entry, `expected a json.schemas entry with fileMatch including "data.json" in ${SETTINGS_PATH}`);
    assert.ok(entry.url.endsWith('schema.json'), `expected the schema url to end with schema.json, got ${entry.url}`);

    await assertValidatorRecognisesBinding('data.json');
  });

  test('[S08-SR-04] WorkspaceFolder scope + YAML: folder-relative pattern, validator recognises it', async () => {
    await openFixtureFile('data.yaml');
    await bindActiveFile('schema.yaml', vscode.ConfigurationTarget.WorkspaceFolder);

    const settings = readJsonFile(SETTINGS_PATH);
    const yamlSchemas = settings['yaml.schemas'] ?? {};
    const patterns = Object.values(yamlSchemas) as (string | string[])[];
    const matches = patterns.some(p => (Array.isArray(p) ? p : [p]).some(pp => pp === 'data.yaml' || pp === './data.yaml'));
    assert.ok(matches, `expected a yaml.schemas pattern matching "data.yaml" in ${JSON.stringify(yamlSchemas)}`);

    await assertValidatorRecognisesBinding('data.yaml');
  });

  test('[S08-SR-04] Global (User) scope + JSON: absolute path, validator recognises it', async () => {
    await openFixtureFile('data.json');
    await bindActiveFile('schema.json', vscode.ConfigurationTarget.Global);

    const inspect = vscode.workspace.getConfiguration('json', vscode.Uri.file(path.join(FIXTURE, 'data.json')))
      .inspect<any[]>('schemas');
    const entry = (inspect?.globalValue ?? []).find((e: any) => e.fileMatch?.includes('data.json'));
    assert.ok(entry, 'expected a Global-scope json.schemas entry');
    assert.ok(path.isAbsolute(entry.url), `expected an absolute schema path at Global scope, got ${entry.url}`);

    await assertValidatorRecognisesBinding('data.json');
  });

  test('[S08-SR-04] Global (User) scope + YAML: absolute path, validator recognises it', async () => {
    await openFixtureFile('data.yaml');
    await bindActiveFile('schema.yaml', vscode.ConfigurationTarget.Global);

    const inspect = vscode.workspace.getConfiguration('yaml', vscode.Uri.file(path.join(FIXTURE, 'data.yaml')))
      .inspect<Record<string, string | string[]>>('schemas');
    const globalValue = inspect?.globalValue ?? {};
    const isAbsoluteMatch = Object.entries(globalValue).some(([schemaPath, pattern]) => {
      const patterns = Array.isArray(pattern) ? pattern : [pattern];
      return path.isAbsolute(schemaPath) && patterns.includes('data.yaml');
    });
    assert.ok(isAbsoluteMatch, `expected an absolute-path Global-scope yaml.schemas entry, got ${JSON.stringify(globalValue)}`);

    await assertValidatorRecognisesBinding('data.yaml');
  });
});
