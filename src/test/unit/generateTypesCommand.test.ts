import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { generateTypesCommand } = require('../../GenerateTypesCommand');
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

function pickTypeScript() {
  vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find((i: any) => i.id === 'typescript'));
}

let dir: string;
setup(() => {
  vscode.resetAll();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-gentypes-'));
});
teardown(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

suite('[F18-FR-01] generateTypesCommand — gating', () => {
  test('non-schema file shows an info message', async () => {
    activate('/ws/data.json', '{"just":"data"}');
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(vscode.window.showInformationMessage.calledWith(
      'Open a JSON Schema file to generate types from it.'));
  });

  test('an unparsable schema source shows an error', async () => {
    const bad = path.join(dir, 'broken.json');
    fs.writeFileSync(bad, '{"$schema": broken');
    vscode.window.activeTextEditor = undefined;
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())(bad);
    assert.ok(vscode.window.showErrorMessage.calledWith('Cannot parse the schema file.'));
  });

  test('[F18-FR-02] cancelling the language picker does nothing', async () => {
    activate('/ws/schema.json', '{"$schema":"x","type":"object"}');
    vscode.window.showQuickPick.resolves(undefined);
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('[F18-FR-02] the picker offers TypeScript as a selectable target', async () => {
    activate('/ws/schema.json', '{"$schema":"x","type":"object"}');
    vscode.window.showQuickPick.resolves(undefined);
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    const items = vscode.window.showQuickPick.lastCall.args[0];
    assert.ok(items.some((i: any) => i.id === 'typescript'));
  });
});

suite('[F18-FR-02] generateTypesCommand — output', () => {
  test('opens a new untitled TypeScript editor with the generated code', async () => {
    activate(path.join(dir, 'server-config.json'), JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['host'],
      properties: { host: { type: 'string' }, port: { type: 'integer' } },
      additionalProperties: false,
    }));
    pickTypeScript();
    await generateTypesCommand(fakeAuth(async () => { throw new Error('no network'); }), fakeCache())();
    assert.ok(vscode.workspace.openTextDocument.called);
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'typescript');
    assert.match(arg.content, /export interface ServerConfig\b/);
    assert.match(arg.content, /host:\s*string;/);
    assert.match(arg.content, /port\?:\s*number;/);
    assert.ok(vscode.window.showTextDocument.called);
  });

  test('[F18-FR-06] a relative external $ref is bundled through F14 into a named declaration', async () => {
    fs.writeFileSync(path.join(dir, 'address.json'), JSON.stringify({
      type: 'object', required: ['city'], properties: { city: { type: 'string' } }, additionalProperties: false,
    }));
    activate(path.join(dir, 'root.json'), JSON.stringify({
      $schema: 'x',
      type: 'object',
      properties: { home: { $ref: 'address.json' }, work: { $ref: 'address.json' } },
      additionalProperties: false,
    }));
    pickTypeScript();
    await generateTypesCommand(fakeAuth(async () => { throw new Error('no network'); }), fakeCache())();
    const content = vscode.workspace.openTextDocument.lastCall.args[0].content;
    assert.strictEqual((content.match(/export interface Address\b/g) ?? []).length, 1);
    assert.match(content, /home\?:\s*Address;/);
    assert.match(content, /work\?:\s*Address;/);
  });

  test('[F18-NFR-01] a remote $ref is served from the schema cache, not the network', async () => {
    activate(path.join(dir, 'root.json'), JSON.stringify({
      $schema: 'x',
      type: 'object',
      properties: { shared: { $ref: 'https://corp/shared.json' } },
      additionalProperties: false,
    }));
    pickTypeScript();
    let fetched = false;
    const cache = fakeCache({
      'https://corp/shared.json': JSON.stringify({ type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false }),
    });
    await generateTypesCommand(fakeAuth(async () => { fetched = true; return '{}'; }), cache)();
    assert.strictEqual(fetched, false, 'cached remote ref must not hit the network');
    assert.match(vscode.workspace.openTextDocument.lastCall.args[0].content, /id\?:\s*string;/);
  });

  test('[F18-FR-06] a 401 on a remote ref offers Configure Auth', async () => {
    activate(path.join(dir, 'root.json'), JSON.stringify({
      $schema: 'x', properties: { a: { $ref: 'https://corp/s.json' } },
    }));
    pickTypeScript();
    vscode.window.showErrorMessage.resolves(undefined);
    const auth = fakeAuth(async () => { throw new AuthRequiredError('https://corp/s.json', 401); });
    await generateTypesCommand(auth, fakeCache())();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/requires authentication/));
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('an unresolvable ref shows an error and opens nothing', async () => {
    activate(path.join(dir, 'root.json'), JSON.stringify({
      $schema: 'x', properties: { a: { $ref: 'missing.json' } },
    }));
    pickTypeScript();
    await generateTypesCommand(fakeAuth(async () => { throw new Error('x'); }), fakeCache())();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Type generation failed/));
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('cancellation is silent', async () => {
    activate(path.join(dir, 'root.json'), JSON.stringify({
      $schema: 'x', properties: { a: { $ref: 'other.json' } },
    }));
    fs.writeFileSync(path.join(dir, 'other.json'), '{}');
    pickTypeScript();
    vscode.window.withProgress.callsFake((_o: any, task: any) =>
      task({ report: () => {} }, { isCancellationRequested: true }));
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(!vscode.window.showErrorMessage.called);
    assert.ok(!vscode.workspace.openTextDocument.called);
  });
});

suite('[F18-FR-01] generateTypesCommand — schemaSource argument (bind-notification entry)', () => {
  test('a local schema path generates without any active editor', async () => {
    const schemaPath = path.join(dir, 'app-settings.json');
    fs.writeFileSync(schemaPath, JSON.stringify({
      type: 'object', required: ['level'], properties: { level: { type: 'string' } }, additionalProperties: false,
    }));
    vscode.window.activeTextEditor = undefined;
    pickTypeScript();
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())(schemaPath);
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'typescript');
    assert.match(arg.content, /export interface AppSettings\b/);
  });

  test('a cached remote schema URL is read from the cache', async () => {
    vscode.window.activeTextEditor = undefined;
    pickTypeScript();
    let fetched = false;
    const cache = fakeCache({
      'https://corp/cfg.json': JSON.stringify({ title: 'CorpConfig', type: 'object', properties: { on: { type: 'boolean' } }, additionalProperties: false }),
    });
    await generateTypesCommand(fakeAuth(async () => { fetched = true; return '{}'; }), cache)('https://corp/cfg.json');
    assert.strictEqual(fetched, false);
    assert.match(vscode.workspace.openTextDocument.lastCall.args[0].content, /export interface CorpConfig\b/);
  });

  test('an uncached remote schema URL is fetched through auth', async () => {
    vscode.window.activeTextEditor = undefined;
    pickTypeScript();
    const auth = fakeAuth(async () =>
      JSON.stringify({ title: 'Remote', type: 'object', properties: { v: { type: 'number' } }, additionalProperties: false }));
    await generateTypesCommand(auth, fakeCache())('https://corp/remote.json');
    assert.match(vscode.workspace.openTextDocument.lastCall.args[0].content, /export interface Remote\b/);
  });

  test('an auth-protected remote schema offers Configure Auth', async () => {
    vscode.window.activeTextEditor = undefined;
    vscode.window.showErrorMessage.resolves(undefined);
    const auth = fakeAuth(async () => { throw new AuthRequiredError('https://corp/priv.json', 401); });
    await generateTypesCommand(auth, fakeCache())('https://corp/priv.json');
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/requires authentication/));
  });

  test('an unreadable local path shows an error', async () => {
    vscode.window.activeTextEditor = undefined;
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())(path.join(dir, 'nope.json'));
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot read the schema file/));
  });
});
