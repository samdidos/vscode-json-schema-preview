import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { generateTypesCommand } = require('../../GenerateTypesCommand');
const { AuthRequiredError } = require('../../SchemaAuthManager');
const { TARGET_LANGUAGES } = require('../../typeGenerator');

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

/** Answers both wizard steps: `language` from the target picker, then the
 *  destination picker (`untitled` by default — F18-FR-11's default path). */
function pickLanguage(language = 'typescript', destination = 'untitled') {
  vscode.window.showQuickPick.callsFake(async (items: any[]) =>
    items.find((i: any) => i.id === language) ?? items.find((i: any) => i.id === destination));
}
const pickTypeScript = () => pickLanguage('typescript');

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

  test('[S02] blocked in an untrusted workspace', async () => {
    (vscode.workspace as any).isTrusted = false;
    activate(path.join(dir, 'schema.json'), '{"$schema":"x","type":"object"}');
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(vscode.window.showWarningMessage.called);
    assert.ok(!vscode.window.showQuickPick.called);
  });

  test('[F18-FR-02] cancelling the language picker does nothing', async () => {
    activate('/ws/schema.json', '{"$schema":"x","type":"object"}');
    vscode.window.showQuickPick.resolves(undefined);
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(!vscode.workspace.openTextDocument.called);
  });

  test('[F18-FR-02][F18-FR-10] the picker offers every supported target, TypeScript first', async () => {
    activate('/ws/schema.json', '{"$schema":"x","type":"object"}');
    vscode.window.showQuickPick.resolves(undefined);
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    const items = vscode.window.showQuickPick.lastCall.args[0];
    assert.deepStrictEqual(
      items.map((i: any) => i.id),
      TARGET_LANGUAGES.map((t: any) => t.id),
    );
    assert.strictEqual(items[0].id, 'typescript');
  });

  test('[F18-FR-11] cancelling the destination picker generates nothing', async () => {
    activate(path.join(dir, 'schema.json'), '{"$schema":"x","type":"object"}');
    // Answer the language picker, cancel the destination picker.
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.id === 'typescript'))
      .onSecondCall().resolves(undefined);
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    assert.ok(!vscode.workspace.openTextDocument.called);
    assert.ok(!vscode.window.withProgress.called, 'no generation runs for a cancelled wizard');
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

suite('[F18-FR-10] generateTypesCommand — additional target languages', function () {
  this.timeout(20000);

  test('picking Python opens an untitled editor with python content', async () => {
    activate(path.join(dir, 'app.schema.json'), JSON.stringify({
      $schema: 'x', title: 'App', type: 'object',
      properties: { name: { type: 'string' } }, additionalProperties: false,
    }));
    pickLanguage('python');
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'python');
    assert.match(arg.content, /class App/);
  });

  test('[F18-FR-02] an unknown editor language id falls back to plain text', async () => {
    activate(path.join(dir, 'app.schema.json'), JSON.stringify({
      $schema: 'x', title: 'App', type: 'object',
      properties: { name: { type: 'string' } }, additionalProperties: false,
    }));
    pickLanguage('kotlin');
    // Simulate a VS Code without Kotlin support: unknown ids reject.
    vscode.workspace.openTextDocument.callsFake(async (arg: any) => {
      if (arg?.language === 'kotlin') { throw new Error('Unknown language id'); }
      return { languageId: arg?.language };
    });
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    const languagesTried = vscode.workspace.openTextDocument.getCalls().map((c: any) => c.args[0]?.language);
    assert.deepStrictEqual(languagesTried, ['kotlin', 'plaintext']);
    assert.ok(vscode.window.showTextDocument.called);
  });
});

suite('[F18-FR-11] generateTypesCommand — save to file', function () {
  this.timeout(20000);

  test('the save dialog defaults to <stem>.<ext> next to the schema; the file is written and opened', async () => {
    activate(path.join(dir, 'server-config.json'), JSON.stringify({
      $schema: 'x', type: 'object', properties: { host: { type: 'string' } }, additionalProperties: false,
    }));
    pickLanguage('typescript', 'file');
    const savedPath = path.join(dir, 'chosen-name.ts');
    vscode.window.showSaveDialog.resolves(vscode.Uri.file(savedPath));

    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();

    const dialogArgs = vscode.window.showSaveDialog.lastCall.args[0];
    assert.strictEqual(dialogArgs.defaultUri.fsPath, path.join(dir, 'server-config.ts'));
    const written = fs.readFileSync(savedPath, 'utf-8');
    assert.match(written, /export interface ServerConfig\b/);
    // The saved document (not an untitled one) is opened.
    assert.strictEqual(vscode.workspace.openTextDocument.lastCall.args[0].fsPath, savedPath);
    assert.ok(vscode.window.showTextDocument.called);
  });

  test('a remote schema defaults the dialog to the first workspace folder', async () => {
    vscode.window.activeTextEditor = undefined;
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: dir }, name: 'ws', index: 0 }];
    pickLanguage('go', 'file');
    vscode.window.showSaveDialog.resolves(undefined); // inspect the default only
    const cache = fakeCache({
      'https://corp/cfg.json': JSON.stringify({ title: 'Cfg', type: 'object', properties: { on: { type: 'boolean' } }, additionalProperties: false }),
    });
    await generateTypesCommand(fakeAuth(async () => '{}'), cache)('https://corp/cfg.json');
    const dialogArgs = vscode.window.showSaveDialog.lastCall.args[0];
    assert.strictEqual(dialogArgs.defaultUri.fsPath, path.join(dir, 'cfg.go'));
  });

  test('cancelling the save dialog falls back to an untitled editor (output is never lost)', async () => {
    activate(path.join(dir, 'schema.json'), JSON.stringify({
      $schema: 'x', title: 'Kept', type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false,
    }));
    pickLanguage('typescript', 'file');
    vscode.window.showSaveDialog.resolves(undefined);
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'typescript');
    assert.match(arg.content, /export interface Kept\b/);
  });
});

suite('[F18-FR-11] generateTypesCommand — multi-file (Java) folder save', function () {
  this.timeout(20000);

  const personSchema = () => JSON.stringify({
    $schema: 'x', title: 'Person', type: 'object',
    properties: {
      name: { type: 'string' },
      address: {
        title: 'Address', type: 'object',
        properties: { city: { type: 'string' } }, additionalProperties: false,
      },
    },
    additionalProperties: false,
  });

  test('Java saves into a user-picked folder and opens the top-level file', async () => {
    activate(path.join(dir, 'person.schema.json'), personSchema());
    pickLanguage('java', 'file');
    const folder = fs.mkdtempSync(path.join(dir, 'out-'));
    vscode.window.showOpenDialog.resolves([vscode.Uri.file(folder)]);

    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();

    const dialogArgs = vscode.window.showOpenDialog.lastCall.args[0];
    assert.strictEqual(dialogArgs.canSelectFolders, true);
    assert.strictEqual(dialogArgs.canSelectFiles, false);
    assert.strictEqual(dialogArgs.defaultUri.fsPath, dir);

    const written = fs.readdirSync(folder).sort();
    assert.ok(written.length > 1, `expected multiple Java files, got ${written.join(', ')}`);
    assert.ok(written.includes('Person.java'));
    assert.ok(written.includes('Address.java'));
    assert.match(fs.readFileSync(path.join(folder, 'Person.java'), 'utf-8'), /class Person\b/);
    // No overwrite prompt for a clean folder; the top-level file is opened.
    assert.ok(!vscode.window.showWarningMessage.called);
    assert.strictEqual(vscode.workspace.openTextDocument.lastCall.args[0].fsPath, path.join(folder, 'Person.java'));
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/Wrote \d+ files to/));
  });

  test('an existing file prompts before overwriting; declining writes nothing and falls back to untitled', async () => {
    activate(path.join(dir, 'person.schema.json'), personSchema());
    pickLanguage('java', 'file');
    const folder = fs.mkdtempSync(path.join(dir, 'out-'));
    fs.writeFileSync(path.join(folder, 'Person.java'), 'PRE-EXISTING');
    vscode.window.showOpenDialog.resolves([vscode.Uri.file(folder)]);
    vscode.window.showWarningMessage.resolves(undefined); // decline

    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();

    assert.ok(vscode.window.showWarningMessage.calledWithMatch(/already exist.*Overwrite\?/));
    assert.strictEqual(fs.readFileSync(path.join(folder, 'Person.java'), 'utf-8'), 'PRE-EXISTING');
    assert.strictEqual(fs.readdirSync(folder).length, 1, 'no other file is written on decline');
    // Fallback: the banner-joined preview opens untitled instead.
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.match(arg.content, /\/\/ Person\.java/);
    assert.match(arg.content, /\/\/ Address\.java/);
  });

  test('confirming the overwrite writes every file', async () => {
    activate(path.join(dir, 'person.schema.json'), personSchema());
    pickLanguage('java', 'file');
    const folder = fs.mkdtempSync(path.join(dir, 'out-'));
    fs.writeFileSync(path.join(folder, 'Person.java'), 'PRE-EXISTING');
    vscode.window.showOpenDialog.resolves([vscode.Uri.file(folder)]);
    vscode.window.showWarningMessage.resolves('Overwrite');

    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();

    assert.match(fs.readFileSync(path.join(folder, 'Person.java'), 'utf-8'), /class Person\b/);
    assert.ok(fs.readdirSync(folder).length > 1);
  });

  test('the untitled destination presents Java as one banner-separated preview', async () => {
    activate(path.join(dir, 'person.schema.json'), personSchema());
    pickLanguage('java'); // untitled default
    await generateTypesCommand(fakeAuth(async () => '{}'), fakeCache())();
    const arg = vscode.workspace.openTextDocument.lastCall.args[0];
    assert.strictEqual(arg.language, 'java');
    assert.match(arg.content, /\/\/ Person\.java/);
    assert.match(arg.content, /\/\/ Address\.java/);
    assert.match(arg.content, /class Person\b/);
    assert.match(arg.content, /class Address\b/);
    assert.ok(!vscode.window.showOpenDialog.called);
  });
});
