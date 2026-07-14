import * as assert from 'assert';
import * as vscode from '../mocks/vscode';

const { migrateDraftCommand } = require('../../DraftMigrationCommand');

const META_07 = 'http://json-schema.org/draft-07/schema#';

function activate(text: string, languageId = 'json', fsPath = '/ws/schema.json') {
  vscode.window.activeTextEditor = {
    document: { languageId, getText: () => text, uri: { fsPath, scheme: 'file' } },
  } as any;
}

/** Make showQuickPick return the pick with the given target-draft id. */
function pickDraft(id: string | undefined) {
  vscode.window.showQuickPick.callsFake(async (items: any[]) =>
    id === undefined ? undefined : items.find((i: any) => i.id === id));
}

setup(() => vscode.resetAll());

suite('[F22-FR-10] migrateDraftCommand — gating', () => {
  test('shows an info message when there is no schema file open', async () => {
    vscode.window.activeTextEditor = undefined;
    await migrateDraftCommand()();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/Open a JSON Schema file/));
  });

  test('a non-schema JSON file (no $schema) is not offered migration', async () => {
    activate('{"just":"data"}', 'json', '/ws/data.json');
    pickDraft('2020-12');
    await migrateDraftCommand()();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/Open a JSON Schema file/));
    assert.ok(!vscode.workspace.openTextDocument.called);
  });
});

suite('[F22-FR-11] migrateDraftCommand — migration output', () => {
  test('[F22-FR-12] opens the migrated schema beside the source and reports the change count', async () => {
    activate(`{"$schema":"${META_07}","definitions":{"X":{"type":"string"}}}`);
    pickDraft('2020-12');
    const opened = { languageId: 'json' };
    vscode.workspace.openTextDocument.resolves(opened as any);
    await migrateDraftCommand()();

    // A new document was opened with $defs (upgraded) and shown Beside.
    const arg = vscode.workspace.openTextDocument.firstCall.args[0];
    assert.match(arg.content, /"\$defs"/);
    assert.strictEqual(arg.language, 'json');
    assert.ok(vscode.window.showTextDocument.calledWith(opened));
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/Migrated to Draft 2020-12/));
  });

  test('[F22-FR-09] reports "already conforms" and opens nothing when there is no change', async () => {
    activate(`{"$schema":"${META_07}","type":"object"}`);
    pickDraft('draft-07');
    await migrateDraftCommand()();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/already conforms/));
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('cancelling the draft picker does nothing', async () => {
    activate(`{"$schema":"${META_07}","definitions":{"X":{}}}`);
    pickDraft(undefined);
    await migrateDraftCommand()();
    assert.ok(!vscode.workspace.openTextDocument.called);
    assert.ok(!vscode.window.showInformationMessage.called);
  });

  test('emits YAML output for a YAML schema source', async () => {
    activate('$schema: ' + META_07 + '\ndefinitions:\n  X:\n    type: string\n', 'yaml', '/ws/schema.yaml');
    pickDraft('2020-12');
    vscode.workspace.openTextDocument.resolves({ languageId: 'yaml' } as any);
    await migrateDraftCommand()();
    const arg = vscode.workspace.openTextDocument.firstCall.args[0];
    assert.strictEqual(arg.language, 'yaml');
    assert.match(arg.content, /\$defs:/);
  });
});
