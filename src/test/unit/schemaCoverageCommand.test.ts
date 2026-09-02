import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from '../mocks/vscode';

const { registerSchemaCoverage } = require('../../SchemaCoverageCommand');

function fakeCache(readCached?: (url: string) => string | undefined) {
  return { readCached: readCached ?? (() => undefined) } as any;
}

/** Register the command and return its handler + the diagnostic collection it made. */
function register(cache = fakeCache()) {
  const collection = { set: sinon.stub(), clear: sinon.stub(), delete: sinon.stub(), dispose: sinon.stub() };
  vscode.languages.createDiagnosticCollection.returns(collection);
  const context = { subscriptions: [] as any[] };
  registerSchemaCoverage(context, cache);
  const handler = vscode.commands.registerCommand.args.find((a: any[]) => a[0] === 'jsonschema.schemaCoverage')![1];
  return { handler, collection };
}

function activate(fsPath: string, text: string, languageId = 'json') {
  vscode.window.activeTextEditor = {
    document: { languageId, getText: () => text, uri: { fsPath, scheme: 'file' } },
  } as any;
}

let dir: string;
setup(() => {
  vscode.resetAll();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-cov-'));
});
teardown(() => { if (dir) { fs.rmSync(dir, { recursive: true, force: true }); } });

suite('[F23-FR-01] schemaCoverage — gating', () => {
  test('registers the command and a diagnostic collection', () => {
    register();
    assert.ok(vscode.languages.createDiagnosticCollection.calledWith('jsonschema-coverage'));
    const ids = vscode.commands.registerCommand.args.map((a: any[]) => a[0]);
    assert.ok(ids.includes('jsonschema.schemaCoverage'));
  });

  test('no active editor shows an info message', async () => {
    const { handler } = register();
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/Open a JSON, YAML, or TOML data file/));
  });

  test('an unsupported language shows an info message', async () => {
    const { handler } = register();
    activate('/ws/readme.md', '# hi', 'markdown');
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/Open a JSON, YAML, or TOML data file/));
  });
});

suite('[F23-FR-02] schemaCoverage — schema resolution', () => {
  test('no bound schema shows an actionable notice', async () => {
    const { handler } = register();
    activate(path.join(dir, 'data.json'), JSON.stringify({ a: 1 }));
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/No schema is bound/));
  });

  test('an uncached remote schema offers to cache it', async () => {
    const { handler } = register(fakeCache(() => undefined));
    activate(path.join(dir, 'data.json'), JSON.stringify({ $schema: 'https://corp/s.json', a: 1 }));
    vscode.window.showInformationMessage.resolves('Cache Schema Locally');
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/not cached locally/));
    assert.ok(vscode.commands.executeCommand.calledWith('jsonschema.cacheSchemaLocally', 'https://corp/s.json'));
  });

  test('an unreadable local schema shows an error', async () => {
    const { handler } = register();
    activate(path.join(dir, 'data.json'), JSON.stringify({ $schema: './missing.json', a: 1 }));
    await handler();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot read the bound schema/));
  });
});

suite('[F23-FR-07] schemaCoverage — highlighting', () => {
  test('places Unnecessary diagnostics on unexercised properties and reports coverage', async () => {
    const schemaPath = path.join(dir, 's.json');
    fs.writeFileSync(schemaPath, JSON.stringify({ properties: { a: {}, b: {} } }, null, 2));
    const { handler, collection } = register();
    activate(path.join(dir, 'data.json'), JSON.stringify({ $schema: './s.json', a: 1 }));
    vscode.window.showInformationMessage.resolves(undefined);
    await handler();

    assert.ok(collection.clear.called, 'clears the previous run');
    assert.ok(collection.set.called, 'publishes diagnostics');
    const [uri, diags] = collection.set.firstCall.args;
    assert.strictEqual(uri.fsPath, schemaPath);
    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Information);
    assert.deepStrictEqual(diags[0].tags, [vscode.DiagnosticTag.Unnecessary]);
    assert.match(diags[0].message, /"b" is declared by the schema but never set/);
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/1\/2 properties exercised \(50%\)/));
  });

  test('full coverage clears diagnostics and does not publish', async () => {
    const schemaPath = path.join(dir, 's.json');
    fs.writeFileSync(schemaPath, JSON.stringify({ properties: { a: {} } }));
    const { handler, collection } = register();
    activate(path.join(dir, 'data.json'), JSON.stringify({ $schema: './s.json', a: 1 }));
    vscode.window.showInformationMessage.resolves(undefined);
    await handler();
    assert.ok(collection.clear.called);
    assert.ok(!collection.set.called);
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/1\/1 properties exercised \(100%\)/));
  });
});

suite('[F23-FR-08] schemaCoverage — report', () => {
  test('Copy report writes the unexercised-property markdown to the clipboard', async () => {
    const schemaPath = path.join(dir, 's.json');
    fs.writeFileSync(schemaPath, JSON.stringify({ properties: { a: {}, b: {} } }));
    const { handler } = register();
    activate(path.join(dir, 'data.json'), JSON.stringify({ $schema: './s.json', a: 1 }));
    vscode.window.showInformationMessage.resolves('Copy report');
    await handler();
    assert.ok(vscode.env.clipboard.writeText.called);
    const md = vscode.env.clipboard.writeText.firstCall.args[0];
    assert.match(md, /# Schema coverage/);
    assert.match(md, /## Unexercised properties \(1\)/);
    assert.match(md, /`b`/);
    assert.ok(vscode.window.setStatusBarMessage.calledWithMatch(/copied to the clipboard/)); // F34-FR-12
  });

  test('a YAML data file resolves and reports coverage', async () => {
    const schemaPath = path.join(dir, 's.json');
    fs.writeFileSync(schemaPath, JSON.stringify({ properties: { a: {}, b: {} } }));
    const { handler } = register();
    activate(path.join(dir, 'data.yaml'), '# yaml-language-server: $schema=./s.json\na: 1\n', 'yaml');
    vscode.window.showInformationMessage.resolves(undefined);
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/1\/2 properties exercised \(50%\)/));
  });

  test('a JSONC data file (comments stripped) resolves and reports coverage', async () => {
    const schemaPath = path.join(dir, 's.json');
    fs.writeFileSync(schemaPath, JSON.stringify({ properties: { a: {}, b: {} } }));
    const { handler } = register();
    activate(path.join(dir, 'data.jsonc'), '{\n  // bound schema\n  "$schema": "./s.json",\n  "a": 1\n}', 'jsonc');
    vscode.window.showInformationMessage.resolves(undefined);
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/1\/2 properties exercised \(50%\)/));
  });

  test('a TOML data file resolves via its inline $schema and reports coverage', async () => {
    const schemaPath = path.join(dir, 's.json');
    fs.writeFileSync(schemaPath, JSON.stringify({ properties: { a: {}, b: {} } }));
    const { handler } = register();
    activate(path.join(dir, 'data.toml'), '"$schema" = "./s.json"\na = 1\n', 'toml');
    vscode.window.showInformationMessage.resolves(undefined);
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/1\/2 properties exercised \(50%\)/));
  });
});
