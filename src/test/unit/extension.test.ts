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

  test('registers all 9 commands', () => {
    ext.activate(context);
    const ids: string[] = vscode.commands.registerCommand.args.map((a: any[]) => a[0]);
    assert.ok(ids.includes('jsonschema.preview'));
    assert.ok(ids.includes('jsonschema.edit'));
    assert.ok(ids.includes('jsonschema.openConfig'));
    assert.ok(ids.includes('jsonschema.bindToCurrentFile'));
    assert.ok(ids.includes('jsonschema.validateFile'));
    assert.ok(ids.includes('jsonschema.inferSchema'));
    assert.ok(ids.includes('jsonschema.configureSchemaAuth'));
    assert.ok(ids.includes('jsonschema.cacheSchemaLocally'));
    assert.ok(ids.includes('jsonschema.refreshSchemaCache'));
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

suite('extension — command handlers', () => {
  let context: any;

  setup(() => {
    vscode.resetAll();
    context = {
      subscriptions: [],
      secrets: {
        get:    () => Promise.resolve(undefined),
        store:  () => Promise.resolve(),
        delete: () => Promise.resolve(),
      },
    };
    ext.activate(context);
  });

  function handler(id: string): (...args: any[]) => any {
    const call = (vscode.commands.registerCommand.args as any[][]).find(([cmd]) => cmd === id);
    if (!call) { throw new Error(`command not registered: ${id}`); }
    return call[1];
  }

  // ── jsonschema.inferSchema ─────────────────────────────────────────────────

  test('inferSchema — no editor shows info message', async () => {
    vscode.window.activeTextEditor = undefined;
    await handler('jsonschema.inferSchema')();
    assert.ok(
      vscode.window.showInformationMessage.calledWith(
        'Open a JSON or YAML file to generate a schema from it.'
      )
    );
  });

  test('inferSchema — infers schema from JSON', async () => {
    const doc = {
      languageId: 'json',
      getText: () => '{"name":"Alice","age":30}',
      uri: { fsPath: '/ws/data.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.inferSchema')();
    assert.ok(vscode.workspace.openTextDocument.called);
    assert.ok(
      vscode.window.showInformationMessage.calledWith(
        'Schema inferred — save the file and bind it to use it for validation.'
      )
    );
  });

  test('inferSchema — infers schema from JSONC', async () => {
    const doc = {
      languageId: 'jsonc',
      getText: () => '// comment\n{"name":"Alice"}',
      uri: { fsPath: '/ws/data.jsonc' },
    };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.inferSchema')();
    assert.ok(vscode.workspace.openTextDocument.called);
  });

  test('inferSchema — infers schema from JSONL', async () => {
    const doc = {
      languageId: 'jsonl',
      getText: () => '{"name":"Alice"}\n{"name":"Bob"}',
      uri: { fsPath: '/ws/data.jsonl' },
    };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.inferSchema')();
    assert.ok(vscode.workspace.openTextDocument.called);
  });

  test('inferSchema — infers schema from YAML', async () => {
    const doc = {
      languageId: 'yaml',
      getText: () => 'name: Alice\nage: 30',
      uri: { fsPath: '/ws/data.yaml' },
    };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.inferSchema')();
    assert.ok(vscode.workspace.openTextDocument.called);
  });

  test('inferSchema — shows error for invalid JSON', async () => {
    const doc = {
      languageId: 'json',
      getText: () => 'not valid {',
      uri: { fsPath: '/ws/data.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.inferSchema')();
    assert.ok(vscode.window.showErrorMessage.called);
  });

  // ── jsonschema.configureSchemaAuth ────────────────────────────────────────

  test('configureSchemaAuth — no active editor shows info message', async () => {
    vscode.window.activeTextEditor = undefined;
    await handler('jsonschema.configureSchemaAuth')();
    assert.ok(
      vscode.window.showInformationMessage.calledWith(
        'No remote schema URL found for the current file.'
      )
    );
  });

  test('configureSchemaAuth — local file path URL shows info message', async () => {
    const doc = {
      languageId: 'json',
      getText: () => '{"$schema":"./local.json"}',
      uri: { fsPath: '/ws/data.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.configureSchemaAuth')();
    assert.ok(
      vscode.window.showInformationMessage.calledWith(
        'No remote schema URL found for the current file.'
      )
    );
  });

  // ── jsonschema.cacheSchemaLocally ─────────────────────────────────────────

  test('cacheSchemaLocally — no URL returns without progress', async () => {
    vscode.window.activeTextEditor = undefined;
    await handler('jsonschema.cacheSchemaLocally')();
    assert.ok(!vscode.window.withProgress.called);
  });

  // ── jsonschema.refreshSchemaCache ─────────────────────────────────────────

  test('refreshSchemaCache — no active editor shows info message', async () => {
    vscode.window.activeTextEditor = undefined;
    await handler('jsonschema.refreshSchemaCache')();
    assert.ok(
      vscode.window.showInformationMessage.calledWith(
        'No cached schema found for the current file.'
      )
    );
  });

  test('refreshSchemaCache — remote URL proceeds to withProgress (fails gracefully)', async () => {
    await handler('jsonschema.refreshSchemaCache')('https://example.com/schema.json');
    // withProgress was called (download attempt made, fails because no real server)
    assert.ok(vscode.window.withProgress.called);
  });

  test('cacheSchemaLocally — remote URL with no doc exits before withProgress', async () => {
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.openTextDocument.resolves(undefined);
    await handler('jsonschema.cacheSchemaLocally')('https://example.com/schema.json', undefined);
    assert.ok(!vscode.window.withProgress.called);
  });

  test('configureSchemaAuth — remote URL calls configureAuth (returns falsy → no further action)', async () => {
    vscode.window.showQuickPick.resolves(undefined); // user cancels auth config
    await handler('jsonschema.configureSchemaAuth')('https://example.com/schema.json');
    // configureAuth returned falsy, so no 'configured' branch entered
    assert.ok(!vscode.window.showInformationMessage.called);
  });

  // ── jsonschema.edit ────────────────────────────────────────────────────────

  test('edit — no uri and no active editor does nothing', () => {
    vscode.window.activeTextEditor = undefined;
    handler('jsonschema.edit')(undefined);
    assert.ok(!vscode.window.createWebviewPanel.called);
  });

  test('edit — no uri uses active editor uri (target is truthy)', () => {
    const doc = {
      languageId: 'json',
      getText: () => '{}',
      uri: { fsPath: '/ws/schema.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    // openSchemaEditor is in an excluded file; just verify no crash
    assert.doesNotThrow(() => handler('jsonschema.edit')(undefined));
  });
});

suite('extension — event listener branches', () => {
  let context: { subscriptions: any[] };

  setup(() => {
    vscode.resetAll();
    context = { subscriptions: [] };
    ext.activate(context);
  });

  test('onDidChangeActiveTextEditor with undefined editor is a no-op', () => {
    const cb = vscode.window.onDidChangeActiveTextEditor.firstCall.args[0];
    vscode.commands.executeCommand.resetHistory();
    cb(undefined);
    assert.ok(!vscode.commands.executeCommand.called);
  });

  test('onDidSaveTextDocument with no active editor skips setContext', () => {
    vscode.window.activeTextEditor = undefined;
    const cb = vscode.workspace.onDidSaveTextDocument.firstCall.args[0];
    vscode.commands.executeCommand.resetHistory();
    cb({ uri: { fsPath: '/ws/data.json' } });
    assert.ok(!vscode.commands.executeCommand.called);
  });

  test('onDidChangeTextDocument with liveUpdate=true and schema file schedules update', () => {
    vscode.setConfig('jsonschema.preview', 'liveUpdate', true);
    const cb = vscode.workspace.onDidChangeTextDocument.firstCall.args[0];
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }),
      uri: { fsPath: '/ws/schema.json' },
    };
    assert.doesNotThrow(() => cb({ document: doc }));
  });

  test('maybeAutoPreview opens preview on activate when autoOpen=true and file is schema', () => {
    vscode.resetAll();
    context = { subscriptions: [] };
    vscode.setConfig('jsonschema.preview', 'autoOpen', true);
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }),
      uri: { fsPath: '/ws/schema.json', scheme: 'file' },
    };
    vscode.window.activeTextEditor = { document: doc };
    ext.activate(context);
    assert.ok(vscode.window.createWebviewPanel.called);
  });

  test('maybeAutoPreview skips untitled files even when autoOpen=true', () => {
    vscode.resetAll();
    context = { subscriptions: [] };
    vscode.setConfig('jsonschema.preview', 'autoOpen', true);
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }),
      uri: { fsPath: 'Untitled-1', scheme: 'untitled' },
    };
    vscode.window.activeTextEditor = { document: doc };
    ext.activate(context);
    assert.ok(!vscode.window.createWebviewPanel.called);
  });
});
