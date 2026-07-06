import * as assert from 'assert';
import * as vscode from '../mocks/vscode';

const { SchemaLintManager } = require('../../SchemaLintManager');

/** Document double with the offset/position plumbing the manager needs.
 *  Default filename ends in `.schema.json` so it is lintable even without a
 *  `$schema` key (F17-FR-01 filename fallback). */
function makeDoc(text: string, languageId = 'json', fsPath = '/ws/foo.schema.json') {
  return {
    languageId,
    uri: { fsPath, scheme: 'file', toString: () => `file://${fsPath}` },
    getText: () => text,
    positionAt: (off: number) => new vscode.Position(0, off),
    offsetAt: (pos: any) => pos.character ?? 0,
  };
}

/** The stub diagnostic collection the mock returns from createDiagnosticCollection. */
function collection() {
  return vscode.languages.createDiagnosticCollection.returnValues[0];
}

setup(() => vscode.resetAll());

suite('[F17-NFR-03] SchemaLintManager — diagnostics', () => {
  test('[F17-FR-01] sets diagnostics for a schema file with issues', () => {
    const mgr = new SchemaLintManager();
    mgr.lintDocument(makeDoc('{"type":"object"}'));
    const coll = collection();
    assert.ok(coll.set.called);
    const diags = coll.set.lastCall.args[1];
    assert.ok(diags.length > 0);
    assert.ok(diags.some((d: any) => d.code === 'require-schema-declaration'));
    assert.ok(diags.every((d: any) => d.source === 'json-schema-lint'));
  });

  test('[F17-FR-01] clears diagnostics for a non-schema file', () => {
    const mgr = new SchemaLintManager();
    mgr.lintDocument(makeDoc('{"just":"data"}', 'json', '/ws/data.json'));
    assert.ok(collection().delete.called);
  });

  test('[F17-FR-03] disabling the feature clears diagnostics', () => {
    vscode.setConfig('jsonschema.lint', 'enabled', false);
    const mgr = new SchemaLintManager();
    mgr.lintDocument(makeDoc('{"type":"object"}'));
    assert.ok(collection().delete.called);
  });

  test('[F17-FR-03] a per-rule "off" override suppresses that rule', () => {
    vscode.setConfig('jsonschema.lint', 'rules', { 'require-descriptions': 'off', 'require-root-id': 'off' });
    const mgr = new SchemaLintManager();
    mgr.lintDocument(makeDoc('{"type":"object"}'));
    const diags = collection().set.lastCall.args[1];
    assert.ok(!diags.some((d: any) => d.code === 'require-descriptions'));
    assert.ok(!diags.some((d: any) => d.code === 'require-root-id'));
    assert.ok(diags.some((d: any) => d.code === 'require-schema-declaration'));
  });

  test('[F17-FR-03] a per-rule severity override changes the diagnostic severity', () => {
    vscode.setConfig('jsonschema.lint', 'rules', { 'require-schema-declaration': 'warning' });
    const mgr = new SchemaLintManager();
    mgr.lintDocument(makeDoc('{"type":"object"}'));
    const diags = collection().set.lastCall.args[1];
    const d = diags.find((x: any) => x.code === 'require-schema-declaration');
    assert.strictEqual(d.severity, vscode.DiagnosticSeverity.Warning);
  });
});

suite('[F17-FR-12] SchemaLintManager — code actions', () => {
  test('offers a dedupe fix for a duplicate enum', () => {
    const mgr = new SchemaLintManager();
    const text = '{"$schema":"x","$id":"i","title":"T","enum":[1,1,2]}';
    const doc = makeDoc(text);
    mgr.lintDocument(doc);
    const enumOffset = text.indexOf('[1,1,2]');
    const range = new vscode.Range(new vscode.Position(0, enumOffset), new vscode.Position(0, enumOffset + 1));
    const actions = mgr.provideCodeActions(doc, range);
    assert.ok(actions.some((a: any) => /duplicate/i.test(a.title) && a.edit));
  });

  test('offers the insert-$schema command action', () => {
    const mgr = new SchemaLintManager();
    const doc = makeDoc('{"type":"object"}');
    mgr.lintDocument(doc);
    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1));
    const actions = mgr.provideCodeActions(doc, range);
    const cmd = actions.find((a: any) => a.command?.command === 'jsonschema.lint.insertSchemaDeclaration');
    assert.ok(cmd);
  });

  test('returns no actions when the range is far from any finding', () => {
    const mgr = new SchemaLintManager();
    const text = '{"$schema":"x","$id":"i","title":"T","enum":[1,1,2]}';
    const doc = makeDoc(text);
    mgr.lintDocument(doc);
    const range = new vscode.Range(new vscode.Position(0, 1), new vscode.Position(0, 2));
    const actions = mgr.provideCodeActions(doc, range);
    assert.ok(!actions.some((a: any) => /duplicate/i.test(a.title)));
  });
});

suite('SchemaLintManager — registration', () => {
  test('registers listeners, a code-action provider and the insert command', () => {
    const mgr = new SchemaLintManager();
    const context = { subscriptions: [] as any[] };
    mgr.register(context);
    assert.ok(vscode.workspace.onDidOpenTextDocument.called);
    assert.ok(vscode.workspace.onDidChangeTextDocument.called);
    assert.ok(vscode.workspace.onDidCloseTextDocument.called);
    assert.ok(vscode.languages.registerCodeActionsProvider.called);
    const ids = vscode.commands.registerCommand.args.map((a: any[]) => a[0]);
    assert.ok(ids.includes('jsonschema.lint.insertSchemaDeclaration'));
  });

  test('lints the active editor on registration', () => {
    vscode.window.activeTextEditor = { document: makeDoc('{"type":"object"}') };
    const mgr = new SchemaLintManager();
    mgr.register({ subscriptions: [] });
    assert.ok(collection().set.called);
  });
});

suite('[F17-FR-12] insertSchemaDeclaration command', () => {
  test('inserts the chosen draft $schema via a workspace edit', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('{"type":"object"}') };
    vscode.window.showQuickPick.resolves('https://json-schema.org/draft/2020-12/schema');
    const mgr = new SchemaLintManager();
    const context = { subscriptions: [] as any[] };
    mgr.register(context);
    const handler = vscode.commands.registerCommand.args.find(
      (a: any[]) => a[0] === 'jsonschema.lint.insertSchemaDeclaration',
    )![1];
    await handler();
    assert.ok(vscode.workspace.applyEdit.called);
  });

  test('does nothing when the draft picker is cancelled', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('{"type":"object"}') };
    vscode.window.showQuickPick.resolves(undefined);
    const mgr = new SchemaLintManager();
    mgr.register({ subscriptions: [] });
    const handler = vscode.commands.registerCommand.args.find(
      (a: any[]) => a[0] === 'jsonschema.lint.insertSchemaDeclaration',
    )![1];
    await handler();
    assert.ok(!vscode.workspace.applyEdit.called);
  });
});
