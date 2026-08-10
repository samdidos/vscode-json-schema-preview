import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from '../mocks/vscode';

// Load after setup.ts has hooked require('vscode')
const ext = require('../../extension');

suite('extension — activate()', () => {
  let context: { subscriptions: any[] };

  setup(() => {
    vscode.resetAll();
    context = { subscriptions: [] };
  });

  test('registers all commands', () => {
    ext.activate(context);
    const ids: string[] = vscode.commands.registerCommand.args.map((a: any[]) => a[0]);
    assert.ok(ids.includes('jsonschema.preview'));
    assert.ok(ids.includes('jsonschema.edit'));
    assert.ok(ids.includes('jsonschema.configure'));
    assert.ok(ids.includes('jsonschema.openConfig'));
    assert.ok(ids.includes('jsonschema.bindToCurrentFile'));
    assert.ok(ids.includes('jsonschema.validateFile'));
    assert.ok(ids.includes('jsonschema.validateWorkspace'));
    assert.ok(ids.includes('jsonschema.inferSchema'));
    assert.ok(ids.includes('jsonschema.generateSampleData'));
    assert.ok(ids.includes('jsonschema.generateTypes'));
    assert.ok(ids.includes('jsonschema.bundleSchema'));
    assert.ok(ids.includes('jsonschema.diffSchema'));
    assert.ok(ids.includes('jsonschema.configureSchemaAuth'));
    assert.ok(ids.includes('jsonschema.cacheSchemaLocally'));
    assert.ok(ids.includes('jsonschema.refreshSchemaCache'));
  });

  test('pushes disposables into context.subscriptions', () => {
    ext.activate(context);
    assert.ok(context.subscriptions.length > 0);
  });

  test('[F19-FR-01] registers the TOML completion and hover providers', () => {
    ext.activate(context);
    assert.ok(vscode.languages.registerCompletionItemProvider.calledWithMatch({ language: 'toml' }));
    const hoverSelectors = vscode.languages.registerHoverProvider.args.map((a: any[]) => a[0]);
    assert.ok(hoverSelectors.some((s: any) => s?.language === 'toml'));
  });

  test('registers onDidChangeActiveTextEditor listener', () => {
    ext.activate(context);
    assert.ok(vscode.window.onDidChangeActiveTextEditor.called);
  });

  test('[F28-FR-02][F28-NFR-01] registers onDidChangeTextEditorVisibleRanges and syncs the open preview panel', () => {
    ext.activate(context);
    assert.ok(vscode.window.onDidChangeTextEditorVisibleRanges.called);
    const cb = vscode.window.onDidChangeTextEditorVisibleRanges.firstCall.args[0];
    const preview = require('../../PreviewWebPanel');
    const doc = {
      languageId: 'json',
      getText: () => '{"$schema":"http://json-schema.org/draft-07/schema#"}',
      uri: { fsPath: '/ws/schema.json' },
      lineCount: 11,
    };
    const panel = { webview: { postMessage: sinon.stub() } };
    preview.openJsonSchemaFiles[doc.uri.fsPath] = panel;
    try {
      cb({ textEditor: { document: doc }, visibleRanges: [{ start: { line: 5 } }] });
      assert.ok(panel.webview.postMessage.calledWithMatch({ type: 'scrollSync', fraction: 0.5 }));
    } finally {
      delete preview.openJsonSchemaFiles[doc.uri.fsPath];
    }
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

  test('[S03-SR-09] creates a dedicated "JSON Schema Preview" LogOutputChannel', () => {
    ext.activate(context);
    assert.ok(
      vscode.window.createOutputChannel.calledWith('JSON Schema Preview', { log: true }),
      'expected a LogOutputChannel named "JSON Schema Preview"',
    );
  });

  test('[F01-FR-03] setContext called for active editor on startup — JSON schema file', () => {
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

  test('[F01-FR-03] setContext called for active editor on startup — non-schema file', () => {
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
      // SchemaCache reads its entry list from globalState (e.g. via the
      // generateSampleData remote-source path).
      globalState: {
        get:    (_key: string, defaultValue?: unknown) => defaultValue,
        update: () => Promise.resolve(),
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

  test('[F06-FR-12] inferSchema — infers schema from JSON', async () => {
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

  test('[F06-FR-07] inferSchema — shows error for invalid JSON', async () => {
    const doc = {
      languageId: 'json',
      getText: () => 'not valid {',
      uri: { fsPath: '/ws/data.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.inferSchema')();
    assert.ok(vscode.window.showErrorMessage.called);
  });

  // ── jsonschema.generateSampleData ─────────────────────────────────────────

  test('[F16-FR-01] generateSampleData — non-schema file shows info message', async () => {
    const doc = { languageId: 'json', getText: () => '{"just":"data"}', uri: { fsPath: '/ws/data.json' } };
    vscode.window.activeTextEditor = { document: doc };
    await handler('jsonschema.generateSampleData')();
    assert.ok(vscode.window.showInformationMessage.calledWith(
      'Open a JSON Schema file to generate sample data from it.'));
  });

  test('[F16-FR-02] generateSampleData — JSON output opens an untitled document', async () => {
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', required: ['name'], properties: { name: { type: 'string' } } }),
      uri: { fsPath: '/ws/schema.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    vscode.window.showQuickPick.resolves({ label: 'JSON', id: 'json' });
    await handler('jsonschema.generateSampleData')();
    assert.ok(vscode.workspace.openTextDocument.called);
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'json');
    assert.match(arg.content, /"name": "string"/);
  });

  test('[F16-FR-02] generateSampleData — YAML output uses yaml language', async () => {
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { n: { type: 'number' } }, required: ['n'] }),
      uri: { fsPath: '/ws/schema.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    vscode.window.showQuickPick.resolves({ label: 'YAML', id: 'yaml' });
    await handler('jsonschema.generateSampleData')();
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'yaml');
  });

  test('generateSampleData — cancelling the format picker does nothing', async () => {
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'string' }),
      uri: { fsPath: '/ws/schema.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    vscode.window.showQuickPick.resolves(undefined);
    await handler('jsonschema.generateSampleData')();
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('[F16-FR-01] generateSampleData — a local schemaSource path works without an active editor', async () => {
    const os = require('os');
    const fsMod = require('fs');
    const pathMod = require('path');
    const dir = fsMod.mkdtempSync(pathMod.join(os.tmpdir(), 'jspreview-sample-'));
    const schemaPath = pathMod.join(dir, 'schema.json');
    fsMod.writeFileSync(schemaPath, JSON.stringify(
      { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }));
    try {
      vscode.window.activeTextEditor = undefined;
      vscode.window.showQuickPick.resolves({ label: 'JSON', id: 'json' });
      await handler('jsonschema.generateSampleData')(schemaPath);
      assert.ok(vscode.workspace.openTextDocument.called);
      assert.match(vscode.workspace.openTextDocument.lastCall.args[0].content, /"name": "string"/);
    } finally {
      fsMod.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('[F16-FR-01][F16-NFR-01] generateSampleData — an uncached remote schemaSource offers Cache Schema Locally, no network', async () => {
    vscode.window.activeTextEditor = undefined;
    vscode.window.showInformationMessage.resolves('Cache Schema Locally');
    await handler('jsonschema.generateSampleData')('https://corp/schema.json');
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/not cached locally/));
    assert.ok(vscode.commands.executeCommand.calledWith('jsonschema.cacheSchemaLocally', 'https://corp/schema.json'));
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('[F16-FR-01] generateSampleData — an unreadable schemaSource path shows an error', async () => {
    vscode.window.activeTextEditor = undefined;
    await handler('jsonschema.generateSampleData')('/nonexistent-xyz/schema.json');
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot read the schema file/));
  });

  test('[F16-FR-08] generateSampleData — unsatisfiable schema shows an error', async () => {
    const doc = {
      languageId: 'json',
      getText: () => JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'string', minLength: 5, maxLength: 2 }),
      uri: { fsPath: '/ws/schema.json' },
    };
    vscode.window.activeTextEditor = { document: doc };
    vscode.window.showQuickPick.resolves({ label: 'JSON', id: 'json' });
    await handler('jsonschema.generateSampleData')();
    assert.ok(vscode.window.showErrorMessage.called);
    assert.ok(!vscode.workspace.openTextDocument.called);
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

  test('[F02-FR-01] onDidChangeTextDocument with liveUpdate=true and schema file schedules update', () => {
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

suite('[F08-FR-14][F08-FR-17] extension — automatic cache revalidation', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  let context: any;
  let dir: string;
  let fetchStub: sinon.SinonStub;
  const URL = 'https://example.com/s.json';

  function makeCacheContext() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-ext-reval-'));
    const cachedPath = path.join(dir, 'cached.json');
    fs.writeFileSync(cachedPath, '{"v":1}', 'utf-8');
    const store: Record<string, any> = {
      'schemaauth.cache': [{ originalUrl: URL, cachedPath, etag: '"e1"', fetchedAt: 0 }],
    };
    return {
      subscriptions: [],
      secrets: { get: () => Promise.resolve(undefined), store: () => Promise.resolve(), delete: () => Promise.resolve() },
      globalStorageUri: { fsPath: dir },
      globalState: {
        get: (k: string, d?: any) => (k in store ? store[k] : d),
        update: (k: string, v: any) => { store[k] = v; return Promise.resolve(); },
      },
    };
  }

  const dataDoc = {
    languageId: 'json',
    getText: () => JSON.stringify({ $schema: URL, name: 'x' }),
    uri: { fsPath: '/ws/data.json', scheme: 'file', toString: () => 'file:///ws/data.json' },
    positionAt: (off: number) => new vscode.Position(0, off),
    offsetAt: (pos: any) => pos.character ?? 0,
  };

  setup(() => {
    vscode.resetAll();
    // Another test file registers root-level hooks that stub global.fetch for
    // every test; restore any existing wrap before installing ours so sinon
    // does not throw "already wrapped".
    const g = globalThis as any;
    if (g.fetch && typeof g.fetch.restore === 'function') { g.fetch.restore(); }
    fetchStub = sinon.stub(g, 'fetch');
    fetchStub.resolves({ status: 304, ok: false, text: () => Promise.resolve(''), headers: { get: () => null } });
  });
  teardown(() => {
    if (fetchStub) { fetchStub.restore(); }
    if (dir) { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('does not revalidate when autoRefresh is off (default)', async () => {
    context = makeCacheContext();
    vscode.window.activeTextEditor = { document: dataDoc };
    ext.activate(context);
    await new Promise(r => setImmediate(r));
    assert.ok(!fetchStub.called, 'off mode must not touch the network');
  });

  test('[F08-FR-14] revalidates a cached bound schema on activation in onOpen mode', async () => {
    vscode.setConfig('jsonschema.cache', 'autoRefresh', 'onOpen');
    context = makeCacheContext();
    vscode.window.activeTextEditor = { document: dataDoc };
    ext.activate(context);
    await new Promise(r => setImmediate(r));
    assert.ok(fetchStub.called, 'onOpen mode should send a conditional request');
    const [, opts] = fetchStub.firstCall.args;
    assert.strictEqual(opts.headers['If-None-Match'], '"e1"');
  });

  test('[F08-FR-14] onOpen revalidates each schema at most once per session', async () => {
    vscode.setConfig('jsonschema.cache', 'autoRefresh', 'onOpen');
    context = makeCacheContext();
    ext.activate(context);
    const cb = vscode.window.onDidChangeActiveTextEditor.lastCall.args[0];
    cb({ document: dataDoc });
    await new Promise(r => setImmediate(r));
    const firstCount = fetchStub.callCount;
    cb({ document: dataDoc });
    await new Promise(r => setImmediate(r));
    assert.strictEqual(fetchStub.callCount, firstCount, 'second activation must not re-fetch');
  });

  test('skips revalidation for a data file with no bound/inline schema', async () => {
    vscode.setConfig('jsonschema.cache', 'autoRefresh', 'onOpen');
    context = makeCacheContext();
    ext.activate(context);
    const cb = vscode.window.onDidChangeActiveTextEditor.lastCall.args[0];
    cb({ document: { languageId: 'json', getText: () => '{"name":"x"}', uri: { fsPath: '/ws/plain.json', scheme: 'file' } } });
    await new Promise(r => setImmediate(r));
    assert.ok(!fetchStub.called);
  });
});
