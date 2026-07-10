import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { registerWorkspaceValidation } = require('../../WorkspaceValidateCommand');

function fakeAuth(fetchText?: (url: string) => Promise<string>) {
  let calls = 0;
  return {
    auth: { fetchText: async (url: string) => { calls++; return fetchText ? fetchText(url) : '{}'; } } as any,
    fetchCalls: () => calls,
  };
}

function fakeCache(map: Record<string, string> = {}) {
  let reads = 0;
  return {
    cache: { readCached: (url: string) => { reads++; return url in map ? map[url] : undefined; } } as any,
    cacheReads: () => reads,
  };
}

function uriOf(fsPath: string) {
  return { fsPath, scheme: 'file', toString: () => `file://${fsPath}` } as any;
}

/** Set up N workspace folders backed by real temp dirs. */
function setupFolders(names: string[]): { dirs: string[]; folders: any[] } {
  const dirs = names.map(n => fs.mkdtempSync(path.join(os.tmpdir(), `jspreview-ws-${n}-`)));
  const folders = dirs.map((d, i) => ({ uri: uriOf(d), name: names[i], index: i }));
  vscode.workspace.workspaceFolders = folders as any;
  vscode.workspace.getWorkspaceFolder.callsFake((uri: any) =>
    folders.find(f => uri.fsPath.startsWith(f.uri.fsPath)));
  vscode.workspace.asRelativePath.callsFake((uriOrPath: any) => {
    const p = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.fsPath;
    const folder = folders.find(f => p.startsWith(f.uri.fsPath));
    return folder ? path.relative(folder.uri.fsPath, p) : p;
  });
  return { dirs, folders };
}

function activateCommand(auth?: any, cache?: any) {
  const context = { subscriptions: [] as any[] };
  registerWorkspaceValidation(context as any, auth ?? fakeAuth().auth, cache ?? fakeCache().cache);
  const call = (vscode.commands.registerCommand.args as any[][])
    .find(([id]) => id === 'jsonschema.validateWorkspace');
  assert.ok(call, 'command registered');
  const collection = vscode.languages.createDiagnosticCollection.lastCall.returnValue;
  return { handler: call![1] as () => Promise<void>, collection };
}

/** Diagnostics published for a given file, across all set() calls. */
function diagsFor(collection: any, fsPath: string): any[] {
  return (collection.set.args as any[][])
    .filter(([uri]) => uri.fsPath === fsPath)
    .flatMap(([, diags]) => diags);
}

let cleanupDirs: string[] = [];
setup(() => {
  vscode.resetAll();
  cleanupDirs = [];
});
teardown(() => {
  for (const d of cleanupDirs) { fs.rmSync(d, { recursive: true, force: true }); }
});

function folders(names: string[]) {
  const made = setupFolders(names);
  cleanupDirs.push(...made.dirs);
  return made;
}

const SCHEMA = JSON.stringify({
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string' }, port: { type: 'number' } },
});

suite('[F20-FR-01] validateWorkspace — availability', () => {
  test('without a workspace folder it shows an info message and does nothing', async () => {
    vscode.workspace.workspaceFolders = undefined;
    const { handler } = activateCommand();
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWith('Open a workspace folder to validate it.'));
    assert.ok(!vscode.workspace.findFiles.called);
  });
});

suite('[F20-FR-02] validateWorkspace — discovery across folders and binding forms', () => {
  test('a settings-bound JSON file in folder A and an inline-bound TOML in folder B are both checked', async () => {
    const { dirs } = folders(['A', 'B']);
    // Folder A: settings binding data.json → ./schema.json
    fs.writeFileSync(path.join(dirs[0], 'schema.json'), SCHEMA);
    fs.writeFileSync(path.join(dirs[0], 'data.json'), JSON.stringify({ name: 'ok', port: 1 }));
    vscode.setConfig('json', 'schemas', [{ url: './schema.json', fileMatch: ['data.json'] }]);
    // Folder B: inline-bound TOML
    fs.writeFileSync(path.join(dirs[1], 's.json'), SCHEMA);
    fs.writeFileSync(path.join(dirs[1], 'config.toml'), '"$schema" = "./s.json"\nname = "ok"\n');
    vscode.workspace.findFiles.resolves([
      uriOf(path.join(dirs[0], 'data.json')),
      uriOf(path.join(dirs[1], 'config.toml')),
    ]);

    const { handler } = activateCommand();
    await handler();

    const summary = vscode.window.showInformationMessage.lastCall.args[0];
    assert.match(summary, /2 files checked/);
    assert.match(summary, /2 valid/);
    assert.match(summary, /0 bindings failed/);
  });

  test('a meta-schema $schema marks a schema file, not a data binding', async () => {
    const { dirs } = folders(['A']);
    fs.writeFileSync(path.join(dirs[0], 'thing.schema.json'), JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
    }));
    vscode.workspace.findFiles.resolves([uriOf(path.join(dirs[0], 'thing.schema.json'))]);
    const { auth, fetchCalls } = fakeAuth();
    const { handler } = activateCommand(auth);
    await handler();
    const summary = vscode.window.showInformationMessage.lastCall.args[0];
    assert.match(summary, /0 files checked/);
    assert.match(summary, /1 schema linted/);
    assert.strictEqual(fetchCalls(), 0, 'the meta-schema must not be fetched');
  });
});

suite('[F20-FR-04][F20-FR-05] validateWorkspace — results & diagnostics', () => {
  test('an invalid unopened data file gets a diagnostic at the failing line', async () => {
    const { dirs } = folders(['A']);
    fs.writeFileSync(path.join(dirs[0], 'schema.json'), SCHEMA);
    const dataPath = path.join(dirs[0], 'data.json');
    fs.writeFileSync(dataPath, '{\n  "name": "ok",\n  "port": "not-a-number"\n}');
    vscode.setConfig('json', 'schemas', [{ url: './schema.json', fileMatch: ['data.json'] }]);
    vscode.workspace.findFiles.resolves([uriOf(dataPath)]);

    const { handler, collection } = activateCommand();
    await handler();

    const diags = diagsFor(collection, dataPath);
    assert.strictEqual(diags.length, 1);
    assert.match(diags[0].message, /\/port/);
    assert.strictEqual(diags[0].range.start.line, 2, 'diagnostic on the "port" line');
    assert.strictEqual(diags[0].source, 'json-schema-workspace');
    assert.match(vscode.window.showInformationMessage.lastCall.args[0], /1 with errors/);
  });

  test('[F20-FR-08] re-running clears the previous run first', async () => {
    const { dirs } = folders(['A']);
    fs.writeFileSync(path.join(dirs[0], 'schema.json'), SCHEMA);
    const dataPath = path.join(dirs[0], 'data.json');
    fs.writeFileSync(dataPath, JSON.stringify({ port: 'bad' }));
    vscode.setConfig('json', 'schemas', [{ url: './schema.json', fileMatch: ['data.json'] }]);
    vscode.workspace.findFiles.resolves([uriOf(dataPath)]);

    const { handler, collection } = activateCommand();
    await handler();
    assert.ok(diagsFor(collection, dataPath).length > 0);

    // Fix the file and re-run: collection cleared, no new diagnostics for it.
    fs.writeFileSync(dataPath, JSON.stringify({ name: 'ok' }));
    const setCallsBefore = collection.set.callCount;
    await handler();
    assert.strictEqual(collection.clear.callCount, 2);
    assert.strictEqual(
      (collection.set.args as any[][]).slice(setCallsBefore).filter(([u]) => u.fsPath === dataPath).length,
      0,
      'a now-valid file publishes no diagnostics',
    );
  });

  test('[acceptance 2] a binding to a missing schema produces a binding diagnostic naming the path', async () => {
    const { dirs } = folders(['A']);
    const dataPath = path.join(dirs[0], 'config.json');
    fs.writeFileSync(dataPath, '{\n  "$schema": "./gone.schema.json",\n  "a": 1\n}');
    vscode.workspace.findFiles.resolves([uriOf(dataPath)]);

    const { handler, collection } = activateCommand();
    await handler();

    const diags = diagsFor(collection, dataPath);
    const binding = diags.find((d: any) => /gone\.schema\.json/.test(d.message));
    assert.ok(binding, 'diagnostic naming the unresolved reference');
    assert.strictEqual(binding.range.start.line, 1, 'diagnostic on the inline $schema line');
    assert.match(vscode.window.showInformationMessage.lastCall.args[0], /1 binding failed/);
  });

  test('a settings-based binding failure lands on the settings file line when locatable', async () => {
    const { dirs } = folders(['A']);
    const dataPath = path.join(dirs[0], 'data.json');
    fs.writeFileSync(dataPath, '{"a": 1}');
    fs.mkdirSync(path.join(dirs[0], '.vscode'));
    fs.writeFileSync(
      path.join(dirs[0], '.vscode', 'settings.json'),
      '{\n  "json.schemas": [\n    { "url": "./gone.json", "fileMatch": ["data.json"] }\n  ]\n}',
    );
    vscode.setConfig('json', 'schemas', [{ url: './gone.json', fileMatch: ['data.json'] }]);
    vscode.workspace.findFiles.resolves([uriOf(dataPath)]);

    const { handler, collection } = activateCommand();
    await handler();

    const settingsPath = path.join(dirs[0], '.vscode', 'settings.json');
    const settingsDiags = diagsFor(collection, settingsPath);
    assert.strictEqual(settingsDiags.length, 1);
    assert.strictEqual(settingsDiags[0].range.start.line, 2, 'the settings line naming the schema');
    assert.match(settingsDiags[0].message, /gone\.json/);
  });

  test('a lintable schema file is linted with the F17 rules', async () => {
    const { dirs } = folders(['A']);
    const schemaPath = path.join(dirs[0], 'thing.schema.json');
    // No $schema declaration + properties without additionalProperties → findings.
    fs.writeFileSync(schemaPath, JSON.stringify({ type: 'object', properties: { a: { type: 'string' } } }));
    vscode.workspace.findFiles.resolves([uriOf(schemaPath)]);

    const { handler, collection } = activateCommand();
    await handler();

    const diags = diagsFor(collection, schemaPath);
    assert.ok(diags.some((d: any) => d.code === 'require-schema-declaration'), 'lint rule id carried as code');
    assert.match(vscode.window.showInformationMessage.lastCall.args[0], /1 schema linted/);
  });

  test('one unreadable file does not abort the run', async () => {
    const { dirs } = folders(['A']);
    fs.writeFileSync(path.join(dirs[0], 'schema.json'), SCHEMA);
    const goodPath = path.join(dirs[0], 'data.json');
    fs.writeFileSync(goodPath, JSON.stringify({ name: 'ok' }));
    vscode.setConfig('json', 'schemas', [{ url: './schema.json', fileMatch: ['data.json'] }]);
    vscode.workspace.findFiles.resolves([
      uriOf(path.join(dirs[0], 'missing-file.json')),
      uriOf(goodPath),
    ]);

    const { handler } = activateCommand();
    await handler();

    assert.match(vscode.window.showInformationMessage.lastCall.args[0], /1 valid/);
  });
});

suite('[F20-FR-03] validateWorkspace — caps', () => {
  test('the scan is capped at the configured maximum, with a note', async () => {
    const { dirs } = folders(['A']);
    vscode.setConfig('jsonschema.workspaceValidation', 'maxFiles', 1);
    const a = path.join(dirs[0], 'a.json');
    const b = path.join(dirs[0], 'b.json');
    fs.writeFileSync(a, '{"$schema": "./s.json"}');
    fs.writeFileSync(b, '{"$schema": "./s.json"}');
    fs.writeFileSync(path.join(dirs[0], 's.json'), '{}');
    vscode.workspace.findFiles.resolves([uriOf(a), uriOf(b)]);

    const { handler } = activateCommand();
    await handler();

    assert.strictEqual(vscode.workspace.findFiles.lastCall.args[2], 2, 'asks for maxFiles+1 to detect truncation');
    const summary = vscode.window.showInformationMessage.lastCall.args[0];
    assert.match(summary, /1 file checked/);
    assert.match(summary, /capped at 1 files/);
  });

  test('files over the 1 MiB cap are skipped and counted in the report', async () => {
    const { dirs } = folders(['A']);
    const big = path.join(dirs[0], 'big.json');
    fs.writeFileSync(big, `{"$schema": "./s.json", "pad": "${'x'.repeat(1024 * 1024)}"}`);
    vscode.workspace.findFiles.resolves([uriOf(big)]);
    vscode.window.showInformationMessage.resolves('Copy Report');

    const { handler } = activateCommand();
    await handler();

    assert.match(vscode.window.showInformationMessage.lastCall.args[0], /0 files checked/);
    const report = vscode.env.clipboard.writeText.lastCall.args[0];
    assert.match(report, /1 file\(s\) over 1 MiB skipped/);
  });
});

suite('[F20-FR-06][F20-FR-07] validateWorkspace — progress, cancellation, report', () => {
  test('[acceptance 4] cancelling mid-run stops scheduling and keeps published diagnostics', async () => {
    const { dirs } = folders(['A']);
    const files: any[] = [];
    for (let i = 0; i < 8; i++) {
      const p = path.join(dirs[0], `f${i}.json`);
      fs.writeFileSync(p, '{\n  "$schema": "./gone.json",\n  "a": 1\n}');
      files.push(uriOf(p));
    }
    vscode.workspace.findFiles.resolves(files);

    let reports = 0;
    vscode.window.withProgress.callsFake((_opts: any, task: any) =>
      task(
        { report: () => { reports++; } },
        { get isCancellationRequested() { return reports >= 2; } },
      ));

    const { handler, collection } = activateCommand();
    await handler();

    assert.ok(collection.set.callCount >= 1, 'already-processed files keep their diagnostics');
    assert.ok(collection.set.callCount < 8, 'remaining files are not processed');
    assert.match(vscode.window.showInformationMessage.lastCall.args[0], /cancelled/);
  });

  test('[acceptance 5] Copy Report writes the grouped Markdown report to the clipboard', async () => {
    const { dirs } = folders(['A']);
    fs.writeFileSync(path.join(dirs[0], 'schema.json'), SCHEMA);
    const dataPath = path.join(dirs[0], 'data.json');
    fs.writeFileSync(dataPath, '{\n  "port": false\n}');
    vscode.setConfig('json', 'schemas', [{ url: './schema.json', fileMatch: ['data.json'] }]);
    vscode.workspace.findFiles.resolves([uriOf(dataPath)]);
    vscode.window.showInformationMessage.resolves('Copy Report');

    const { handler } = activateCommand();
    await handler();

    assert.ok(vscode.env.clipboard.writeText.called);
    const report = vscode.env.clipboard.writeText.lastCall.args[0];
    assert.match(report, /^## Workspace validation report/);
    assert.match(report, /### A \(1 file\(s\)\)/);
    assert.match(report, /❌ errors `data\.json`/);
    assert.match(report, /line 2: \/port/);
  });
});

suite('[F20-NFR-02][F20-NFR-03] validateWorkspace — cache reuse & workspace trust', () => {
  test('two files bound to the same remote schema load it once, cache-first', async () => {
    const { dirs } = folders(['A']);
    const a = path.join(dirs[0], 'a.json');
    const b = path.join(dirs[0], 'b.json');
    fs.writeFileSync(a, '{"$schema": "https://corp/s.json", "name": "x"}');
    fs.writeFileSync(b, '{"$schema": "https://corp/s.json", "name": "y"}');
    vscode.workspace.findFiles.resolves([uriOf(a), uriOf(b)]);
    const { cache, cacheReads } = fakeCache({ 'https://corp/s.json': SCHEMA });
    const { auth, fetchCalls } = fakeAuth();

    const { handler } = activateCommand(auth, cache);
    await handler();

    assert.strictEqual(cacheReads(), 1, 'schema load memoized per run');
    assert.strictEqual(fetchCalls(), 0, 'cached schema is never fetched');
    assert.match(vscode.window.showInformationMessage.lastCall.args[0], /2 files checked, 2 valid/);
  });

  test('untrusted workspace: uncached remote schema fails the binding without any fetch', async () => {
    const { dirs } = folders(['A']);
    (vscode.workspace as any).isTrusted = false;
    const a = path.join(dirs[0], 'a.json');
    fs.writeFileSync(a, '{"$schema": "https://corp/uncached.json", "x": 1}');
    vscode.workspace.findFiles.resolves([uriOf(a)]);
    const { auth, fetchCalls } = fakeAuth();

    const { handler } = activateCommand(auth, fakeCache().cache);
    await handler();

    assert.strictEqual(fetchCalls(), 0, 'no network in an untrusted workspace');
    const summary = vscode.window.showInformationMessage.lastCall.args[0];
    assert.match(summary, /1 binding failed/);
    assert.match(summary, /Untrusted workspace/);
  });
});
