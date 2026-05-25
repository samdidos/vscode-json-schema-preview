import * as assert from 'assert';
import * as vscode from '../mocks/vscode';

// Load after setup.ts has hooked require('vscode')
const ext = require('../../extension');

suite('extension — activate()', () => {
  let context: { subscriptions: any[] };

  setup(() => {
    vscode.resetAll();
    context = { subscriptions: [] };
  });

  test('registers all 7 commands', () => {
    ext.activate(context);
    const ids: string[] = vscode.commands.registerCommand.args.map((a: any[]) => a[0]);
    assert.ok(ids.includes('jsonschema.preview'));
    assert.ok(ids.includes('jsonschema.edit'));
    assert.ok(ids.includes('jsonschema.configure'));
    assert.ok(ids.includes('jsonschema.openConfig'));
    assert.ok(ids.includes('jsonschema.bindToCurrentFile'));
    assert.ok(ids.includes('jsonschema.validateFile'));
    assert.ok(ids.includes('jsonschema.inferSchema'));
  });

  test('pushes disposables into context.subscriptions', () => {
    ext.activate(context);
    assert.ok(context.subscriptions.length > 0);
  });

  test('registers onDidChangeActiveTextEditor listener', () => {
    ext.activate(context);
    assert.ok(vscode.window.onDidChangeActiveTextEditor.called);
  });

  test('registers onDidSaveTextDocument listener', () => {
    ext.activate(context);
    assert.ok(vscode.workspace.onDidSaveTextDocument.called);
  });

  test('registers onDidOpenTextDocument listener', () => {
    ext.activate(context);
    assert.ok(vscode.workspace.onDidOpenTextDocument.called);
  });

  test('registers onDidChangeTextDocument listener', () => {
    ext.activate(context);
    assert.ok(vscode.workspace.onDidChangeTextDocument.called);
  });

  test('setContext called for active editor on startup — JSON schema file', () => {
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }),
      uri: { fsPath: '/ws/schema.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    ext.activate(context);
    assert.ok(
      vscode.commands.executeCommand.calledWith('setContext', 'jsonschema.isJsonSchema', true)
    );
  });

  test('setContext called for active editor on startup — non-schema file', () => {
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ title: 'plain data' }),
      uri: { fsPath: '/ws/data.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    ext.activate(context);
    assert.ok(
      vscode.commands.executeCommand.calledWith('setContext', 'jsonschema.isJsonSchema', false)
    );
  });

  test('onDidChangeActiveTextEditor triggers setContext', () => {
    ext.activate(context);
    const cb = vscode.window.onDidChangeActiveTextEditor.firstCall.args[0];
    const doc = {
      languageId: 'yaml',
      getText: () => '$schema: http://json-schema.org/draft-07/schema#',
      uri: { fsPath: '/ws/schema.yaml' },
    };
    cb({ document: doc });
    assert.ok(
      vscode.commands.executeCommand.calledWith('setContext', 'jsonschema.isJsonSchema', true)
    );
  });

  test('onDidSaveTextDocument re-evaluates context', () => {
    ext.activate(context);
    const cb = vscode.workspace.onDidSaveTextDocument.lastCall.args[0];
    const doc = {
      languageId: 'json',
      getText: () => '{"title":"no schema"}',
      uri: { fsPath: '/ws/data.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    cb(doc);
    assert.ok(
      vscode.commands.executeCommand.calledWith('setContext', 'jsonschema.isJsonSchema', false)
    );
  });

  test('deactivate() exists and does not throw', () => {
    assert.doesNotThrow(() => ext.deactivate());
  });
});
