import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('samdidos.json-schema-preview');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('activates successfully', () => {
    const ext = vscode.extensions.getExtension('samdidos.json-schema-preview');
    assert.ok(ext?.isActive, 'Extension should be active after activation');
  });

  test('registers all commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    const expected = [
      'jsonschema.preview',
      'jsonschema.edit',
      'jsonschema.configure',
      'jsonschema.openConfig',
      'jsonschema.bindToCurrentFile',
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `Command "${cmd}" should be registered`);
    }
  });
});
