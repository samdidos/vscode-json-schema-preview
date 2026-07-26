import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { getStoredConfig, setScopedConfig } from '../mocks/vscode';

const { configurePreview } = require('../../ConfigWebPanel');

suite('[F09-FR-01][F09-FR-12][F09-FR-13][F09-FR-14] configurePreview()', () => {
  setup(() => {
    vscode.resetAll();
    (vscode.workspace as any).workspaceFile = undefined;
  });

  test('with no workspace folders, seeds and opens User settings without prompting', async () => {
    vscode.workspace.workspaceFolders = undefined;

    await configurePreview();

    assert.strictEqual(vscode.window.showQuickPick.called, false, 'single option skips the picker');
    assert.deepStrictEqual(getStoredConfig('jsonschema', 'config'), {});
    assert.ok(
      vscode.commands.executeCommand.calledWith(
        'workbench.action.openSettingsJson',
        { revealSetting: { key: 'jsonschema.config' } }
      ),
      'opened the User settings.json with the key revealed'
    );
  });

  test('offers Workspace Folder and User when a single folder is open (no .code-workspace)', async () => {
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws' }];
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.window.showQuickPick.callsFake(async (items: any[]) => {
      assert.strictEqual(items.length, 2, 'Workspace option hidden without a .code-workspace file');
      return items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder);
    });

    await configurePreview();

    assert.deepStrictEqual(getStoredConfig('jsonschema', 'config'), {});
    assert.ok(
      vscode.commands.executeCommand.calledWith(
        'workbench.action.openWorkspaceSettingsFile',
        { revealSetting: { key: 'jsonschema.config' } }
      )
    );
  });

  test('also offers Workspace when a .code-workspace file is active (multi-root)', async () => {
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/ws/a' }, name: 'a' },
      { uri: { fsPath: '/ws/b' }, name: 'b' },
    ];
    (vscode.workspace as any).workspaceFile = { fsPath: '/ws/proj.code-workspace' };
    vscode.window.showQuickPick.callsFake(async (items: any[]) => {
      assert.strictEqual(items.length, 3, 'Folder, Workspace, and User are all offered');
      return items.find((i: any) => i.target === vscode.ConfigurationTarget.Workspace);
    });

    await configurePreview();

    assert.deepStrictEqual(getStoredConfig('jsonschema', 'config'), {});
  });

  test('does not overwrite an existing own value at the chosen scope', async () => {
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws' }];
    const jsTemplateConfig: Record<string, unknown> = JSON.parse('{"template_name":"js"}');
    setScopedConfig('jsonschema', 'config', {
      workspaceFolder: [['/ws', jsTemplateConfig]],
    });
    vscode.window.showQuickPick.callsFake(async (items: any[]) =>
      items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder)
    );

    await configurePreview();

    assert.strictEqual(getStoredConfig('jsonschema', 'config'), undefined, 'no seed write happened');
  });

  test('does nothing when the picker is dismissed', async () => {
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws' }];
    (vscode.workspace as any).workspaceFile = { fsPath: '/ws/proj.code-workspace' };
    vscode.window.showQuickPick.resolves(undefined);

    await configurePreview();

    assert.strictEqual(getStoredConfig('jsonschema', 'config'), undefined);
    assert.strictEqual(vscode.commands.executeCommand.called, false);
  });
});
