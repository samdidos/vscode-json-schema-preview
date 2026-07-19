import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { bundleSchemaCommand } = require('../../SchemaBundleCommand');
const { AuthRequiredError } = require('../../SchemaAuthManager');

function fakeAuth(fetchText: (url: string) => Promise<string>) {
  return { fetchText } as any;
}
function fakeCache(map: Record<string, string> = {}) {
  return { readCached: (url: string) => (url in map ? map[url] : undefined) } as any;
}

function activate(fsPath: string, text: string, languageId = 'json') {
  vscode.window.activeTextEditor = {
    document: { languageId, getText: () => text, uri: { fsPath, scheme: 'file' } },
  } as any;
}

function pickMode(id: 'bundle' | 'dereference') {
  vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find((i: any) => i.id === id));
}

let dir: string;
setup(() => {
  vscode.resetAll();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-bundle-'));
});
teardown(() => { if (dir) {fs.rmSync(dir, { recursive: true, force: true });} });

suite('[F14-FR-01] bundleSchemaCommand — gating', () => {
  test('non-schema file shows an info message', async () => {
    activate('/ws/data.json', '{"just":"data"}');
    await bundleSchemaCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(vscode.window.showInformationMessage.calledWith('Open a JSON Schema file to bundle it.'));
  });

  test('[S02] blocked in an untrusted workspace', async () => {
    (vscode.workspace as any).isTrusted = false;
    activate(path.join(dir, 'root.json'), '{"$schema":"http://json-schema.org/draft-07/schema#"}');
    await bundleSchemaCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(vscode.window.showWarningMessage.called);
  });

  test('[F14-FR-02] cancelling the mode picker does nothing', async () => {
    activate(path.join(dir, 'root.json'), '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object"}');
    vscode.window.showQuickPick.resolves(undefined);
    await bundleSchemaCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(!vscode.workspace.openTextDocument.called);
  });
});

suite('[F14-FR-03][F14-FR-05] bundleSchemaCommand — bundle', () => {
  test('bundles a relative ref into an untitled JSON document', async () => {
    fs.writeFileSync(path.join(dir, 'address.json'), JSON.stringify({ type: 'object', properties: { city: { type: 'string' } } }));
    const rootPath = path.join(dir, 'root.json');
    const root = JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { home: { $ref: 'address.json' } } });
    activate(rootPath, root);
    pickMode('bundle');
    await bundleSchemaCommand(fakeAuth(async () => { throw new Error('no network'); }), fakeCache())();
    assert.ok(vscode.workspace.openTextDocument.called);
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'json');
    const out = JSON.parse(arg.content);
    assert.strictEqual(out.properties.home.$ref, '#/$defs/address');
    assert.deepStrictEqual(out.$defs.address, { type: 'object', properties: { city: { type: 'string' } } });
  });

  // Regression: makeResolver used to call fetch/read + parse once per $ref
  // occurrence, so a schema with N refs into the same external document paid
  // for N network round-trips (or file reads) for one document.
  test('fetches an external document referenced by more than one $ref only once', async () => {
    const rootPath = path.join(dir, 'root.json');
    activate(rootPath, JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        a: { $ref: 'https://corp/shared.json#/$defs/id' },
        b: { $ref: 'https://corp/shared.json#/$defs/id' },
      },
    }));
    pickMode('bundle');
    let fetchCount = 0;
    const auth = fakeAuth(async () => {
      fetchCount++;
      return JSON.stringify({ $defs: { id: { type: 'string' } } });
    });
    await bundleSchemaCommand(auth, fakeCache())();
    assert.strictEqual(fetchCount, 1, 'the shared external document should be fetched exactly once');
    const out = JSON.parse(vscode.workspace.openTextDocument.lastCall.args[0].content);
    assert.strictEqual(out.properties.a.$ref, out.properties.b.$ref);
  });

  test('[F14-FR-08] an unresolvable ref shows an error and opens nothing', async () => {
    const rootPath = path.join(dir, 'root.json');
    activate(rootPath, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { $ref: 'missing.json' } } }));
    pickMode('bundle');
    await bundleSchemaCommand(fakeAuth(async () => { throw new Error('x'); }), fakeCache())();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Bundling failed/));
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('[F14-FR-08] a 401 on a remote ref offers Configure Auth', async () => {
    const rootPath = path.join(dir, 'root.json');
    activate(rootPath, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { $ref: 'https://corp/s.json' } } }));
    pickMode('bundle');
    vscode.window.showErrorMessage.resolves(undefined);
    const auth = fakeAuth(async () => { throw new AuthRequiredError('https://corp/s.json', 401); });
    await bundleSchemaCommand(auth, fakeCache())();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/requires authentication/));
  });

  test('[F14-FR-04] prefers the local cache over the network for a remote ref', async () => {
    const rootPath = path.join(dir, 'root.json');
    activate(rootPath, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { $ref: 'https://corp/s.json#/$defs/id' } } }));
    pickMode('bundle');
    const cache = fakeCache({ 'https://corp/s.json': JSON.stringify({ $defs: { id: { type: 'string' } } }) });
    let fetched = false;
    await bundleSchemaCommand(fakeAuth(async () => { fetched = true; return '{}'; }), cache)();
    assert.strictEqual(fetched, false);
    const out = JSON.parse(vscode.workspace.openTextDocument.lastCall.args[0].content);
    assert.strictEqual(out.properties.a.$ref, '#/$defs/s/$defs/id');
  });

  // Regression: makeResolver used to set keyHint from the URL's filename for
  // every resolved document, which schemaBundler's handleRef prefers over
  // deriveKey() — so a referenced schema's own $id (F14-FR-05's first choice)
  // was silently ignored whenever it was reached through the command, only
  // ever exercised by schemaBundler's own direct unit tests.
  test("[F14-FR-05] derives the $defs key from the referenced schema's own $id, not the URL filename", async () => {
    const rootPath = path.join(dir, 'root.json');
    activate(rootPath, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { $ref: 'https://corp/weird-file-name.json#/$defs/id' } } }));
    pickMode('bundle');
    const cache = fakeCache({
      'https://corp/weird-file-name.json': JSON.stringify({ $id: 'person', $defs: { id: { type: 'string' } } }),
    });
    await bundleSchemaCommand(fakeAuth(async () => { throw new Error('no network'); }), cache)();
    const out = JSON.parse(vscode.workspace.openTextDocument.lastCall.args[0].content);
    assert.strictEqual(out.properties.a.$ref, '#/$defs/person/$defs/id');
    assert.ok(out.$defs.person, 'expected the $defs key derived from $id ("person"), not the filename ("weird-file-name")');
  });
});

suite('[F14-FR-03] bundleSchemaCommand — dereference', () => {
  test('dereferences internal refs inline', async () => {
    const rootPath = path.join(dir, 'root.json');
    activate(rootPath, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', $defs: { id: { type: 'string' } }, properties: { a: { $ref: '#/$defs/id' } } }));
    pickMode('dereference');
    await bundleSchemaCommand(fakeAuth(async () => '{}'), fakeCache())();
    const out = JSON.parse(vscode.workspace.openTextDocument.lastCall.args[0].content);
    assert.deepStrictEqual(out.properties.a, { type: 'string' });
  });

  test('produces YAML output for a YAML schema input', async () => {
    const rootPath = path.join(dir, 'root.yaml');
    activate(rootPath, '$schema: http://json-schema.org/draft-07/schema#\n$defs:\n  id:\n    type: string\nproperties:\n  a:\n    $ref: "#/$defs/id"\n', 'yaml');
    pickMode('dereference');
    await bundleSchemaCommand(fakeAuth(async () => '{}'), fakeCache())();
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'yaml');
    assert.match(arg.content, /type: string/);
  });
});
