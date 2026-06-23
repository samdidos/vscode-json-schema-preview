import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';
import { setConfig, getStoredConfig, statusBarItem } from '../mocks/vscode';

const {
  SchemaBindingManager,
  normalise,
  matchesFile,
  dropPattern,
} = require('../../SchemaBindingManager');

// ─── URL token stripping — integration via bindToCurrentFile ─────────────────

suite('SchemaBindingManager — embedded GitHub token stripping', () => {
  setup(() => vscode.resetAll());

  test('strips ?token= from raw GitHub URLs and still binds', async () => {
    const urlWithToken =
      'https://raw.githubusercontent.com/org/private-repo/main/schema.json?token=GHSAT0ABCDEF';
    const expectedUrl =
      'https://raw.githubusercontent.com/org/private-repo/main/schema.json';

    vscode.window.activeTextEditor = { document: makeDoc('json') };
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: '/ws' } });
    vscode.workspace.findFiles.resolves([]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');

    // First showQuickPick: pick "Enter URL…"
    // Second showQuickPick: pick Workspace scope
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));

    // showInputBox returns the URL with an embedded token
    vscode.window.showInputBox.resolves(urlWithToken);

    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();

    const stored = getStoredConfig('json', 'schemas') as any[];
    assert.ok(Array.isArray(stored), 'schema entry was written');
    const entry = stored.find((s: any) => s.fileMatch?.includes('data.json'));
    assert.ok(entry, 'entry matches the bound file');
    assert.strictEqual(entry.url, expectedUrl, 'token was stripped from stored URL');
    // The warning was shown to the user
    assert.ok(vscode.window.showWarningMessage.calledOnce, 'user was warned about the token');
  });

  test('does not modify URLs without an embedded token', async () => {
    const url = 'https://json.schemastore.org/package.json';

    vscode.window.activeTextEditor = { document: makeDoc('json') };
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: '/ws' } });
    vscode.workspace.findFiles.resolves([]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');

    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));

    vscode.window.showInputBox.resolves(url);

    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();

    const stored = getStoredConfig('json', 'schemas') as any[];
    const entry = stored?.find((s: any) => s.fileMatch?.includes('data.json'));
    assert.strictEqual(entry?.url, url, 'clean URL was stored unchanged');
    assert.ok(!vscode.window.showWarningMessage.called, 'no warning for clean URL');
  });
});

// ─── Pure utility functions ────────────────────────────────────────────────────

suite('normalise()', () => {
  test('strips leading ./', () => assert.strictEqual(normalise('./foo.json'), 'foo.json'));
  test('leaves plain path unchanged', () => assert.strictEqual(normalise('foo.json'), 'foo.json'));
  test('leaves nested path unchanged', () => assert.strictEqual(normalise('a/b.json'), 'a/b.json'));
  test('strips only first ./', () => assert.strictEqual(normalise('./a/b.json'), 'a/b.json'));
  test('empty string', () => assert.strictEqual(normalise(''), ''));
});

suite('matchesFile()', () => {
  test('exact match', () => assert.ok(matchesFile(['data.json'], 'data.json')));
  test('pattern has ./', () => assert.ok(matchesFile(['./data.json'], 'data.json')));
  test('file has ./', () => assert.ok(matchesFile(['data.json'], './data.json')));
  test('both have ./', () => assert.ok(matchesFile(['./data.json'], './data.json')));
  test('no match', () => assert.ok(!matchesFile(['other.json'], 'data.json')));
  test('empty array', () => assert.ok(!matchesFile([], 'data.json')));
  test('matches one of many', () => assert.ok(matchesFile(['a.json', 'data.json'], 'data.json')));
});

suite('dropPattern()', () => {
  test('removes single string → undefined', () => assert.strictEqual(dropPattern('x.json', 'x.json'), undefined));
  test('./x matches x → undefined', () => assert.strictEqual(dropPattern('./x.json', 'x.json'), undefined));
  test('no match → returns original string', () => assert.strictEqual(dropPattern('a.json', 'x.json'), 'a.json'));
  test('removes from array, one left → string', () => assert.strictEqual(dropPattern(['x.json', 'b.json'], 'x.json'), 'b.json'));
  test('removes from array, many left → array', () => assert.deepStrictEqual(dropPattern(['a.json', 'x.json', 'c.json'], 'x.json'), ['a.json', 'c.json']));
  test('removes all from array → undefined', () => assert.strictEqual(dropPattern(['x.json'], 'x.json'), undefined));
  test('no match in array → original array', () => assert.deepStrictEqual(dropPattern(['a.json', 'b.json'], 'x.json'), ['a.json', 'b.json']));
});

// ─── SchemaBindingManager class ────────────────────────────────────────────────

function makeContext(initialState: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initialState };
  return {
    subscriptions: [] as any[],
    workspaceState: {
      get:    (key: string, def?: any) => (key in store ? store[key] : def),
      update: (key: string, val: any) => { store[key] = val; return Promise.resolve(); },
    },
  };
}

function makeDoc(languageId: string, fsPath = '/ws/data.json') {
  return { languageId, uri: { fsPath }, getText: () => '' };
}

suite('SchemaBindingManager — constructor & status bar', () => {
  setup(() => vscode.resetAll());

  test('sets status bar command', () => {
    new SchemaBindingManager(makeContext());
    assert.strictEqual(statusBarItem.command, 'jsonschema.bindToCurrentFile');
  });

  test('pushes subscriptions into context', () => {
    const ctx = makeContext();
    new SchemaBindingManager(ctx);
    assert.ok(ctx.subscriptions.length > 0);
  });

  test('hides status bar when no active editor on startup', () => {
    new SchemaBindingManager(makeContext());
    assert.ok(statusBarItem.hide.calledOnce);
  });
});

suite('SchemaBindingManager — refresh via editor change', () => {
  setup(() => vscode.resetAll());

  function triggerEditorChange(editor: any) {
    new SchemaBindingManager(makeContext());
    statusBarItem.show.resetHistory();
    statusBarItem.hide.resetHistory();
    const cb = vscode.window.onDidChangeActiveTextEditor.lastCall.args[0];
    cb(editor);
  }

  test('hides for undefined editor', () => {
    triggerEditorChange(undefined);
    assert.ok(statusBarItem.hide.calledOnce);
  });

  test('hides for non-JSON/YAML language', () => {
    triggerEditorChange({ document: makeDoc('typescript') });
    assert.ok(statusBarItem.hide.calledOnce);
  });

  test('shows "unbound" when JSON file has no binding', () => {
    setConfig('json', 'schemas', []);
    setConfig('yaml', 'schemas', {});
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    triggerEditorChange({ document: makeDoc('json') });
    assert.ok(statusBarItem.show.calledOnce);
    assert.ok(statusBarItem.text.includes('unbound'));
  });

  test('shows "unbound" when YAML file has no binding', () => {
    setConfig('json', 'schemas', []);
    setConfig('yaml', 'schemas', {});
    vscode.workspace.asRelativePath.callsFake(() => 'data.yaml');
    triggerEditorChange({ document: makeDoc('yaml') });
    assert.ok(statusBarItem.show.calledOnce);
    assert.ok(statusBarItem.text.includes('unbound'));
  });

  test('shows schema name when JSON binding exists', () => {
    setConfig('json', 'schemas', [{ url: './myschema.json', fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    triggerEditorChange({ document: makeDoc('json') });
    assert.ok(statusBarItem.show.calledOnce);
    assert.ok(statusBarItem.text.includes('myschema.json'));
  });

  test('shows schema name when YAML binding exists', () => {
    setConfig('yaml', 'schemas', { './myschema.json': 'data.yaml' });
    vscode.workspace.asRelativePath.callsFake(() => 'data.yaml');
    triggerEditorChange({ document: makeDoc('yaml') });
    assert.ok(statusBarItem.show.calledOnce);
    assert.ok(statusBarItem.text.includes('myschema.json'));
  });

  test('shows schema name for YAML array pattern', () => {
    setConfig('yaml', 'schemas', { './myschema.json': ['data.yaml', 'other.yaml'] });
    vscode.workspace.asRelativePath.callsFake(() => 'data.yaml');
    triggerEditorChange({ document: makeDoc('yaml') });
    assert.ok(statusBarItem.show.calledOnce);
    assert.ok(statusBarItem.text.includes('myschema.json'));
  });
});

suite('SchemaBindingManager — configuration change refresh', () => {
  setup(() => vscode.resetAll());

  test('refreshes when json.schemas changes', () => {
    new SchemaBindingManager(makeContext());
    statusBarItem.hide.resetHistory();
    const cb = vscode.workspace.onDidChangeConfiguration.lastCall.args[0];
    cb({ affectsConfiguration: (s: string) => s === 'json.schemas' });
    assert.ok(statusBarItem.hide.calledOnce); // no active editor → hide
  });

  test('does not refresh for unrelated config changes', () => {
    new SchemaBindingManager(makeContext());
    statusBarItem.hide.resetHistory();
    const cb = vscode.workspace.onDidChangeConfiguration.lastCall.args[0];
    cb({ affectsConfiguration: () => false });
    assert.ok(statusBarItem.hide.notCalled);
  });
});

suite('SchemaBindingManager — bindToCurrentFile()', () => {
  setup(() => vscode.resetAll());

  test('shows info message when no active editor', async () => {
    vscode.window.activeTextEditor = undefined;
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(vscode.window.showInformationMessage.calledOnce);
  });

  test('shows info message when active file is not JSON/YAML', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('typescript') };
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(vscode.window.showInformationMessage.calledOnce);
  });

  test('still shows picker when file has no workspace folder', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('json') };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    // User-scoped binding is still available, so picker must be shown
    assert.ok(vscode.window.showQuickPick.calledOnce);
  });

  test('shows picker with URL/Browse options when no schemas are found', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('json') };
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: '/ws' } });
    vscode.workspace.findFiles.resolves([]);
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(vscode.window.showQuickPick.calledOnce);
  });

  test('does nothing when user cancels picker', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('json') };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
      vscode.window.showQuickPick.resolves(undefined); // user cancelled
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      assert.strictEqual(getStoredConfig('json', 'schemas'), undefined);
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('adds JSON binding when user picks schema', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
      // First call: pick the schema item; second call: pick a scope (Workspace)
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('json', 'schemas') as any[];
      assert.ok(Array.isArray(stored));
      assert.ok(stored.some((s: any) => s.fileMatch?.includes('data.json')));
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('adds YAML binding when user picks schema', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('yaml', path.join(tmp, 'data.yaml')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('yaml', 'schemas') as any;
      assert.ok(stored && typeof stored === 'object');
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('removes JSON binding when user picks "Remove"', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      setConfig('json', 'schemas', [{ url: './schema.json', fileMatch: ['data.json'] }]);
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake(() => 'data.json');
      // First call: pick the Remove item; second call: pick scope for the remove
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isRemove))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('json', 'schemas') as any[];
      assert.ok(!stored?.some((s: any) => s.fileMatch?.includes('data.json')));
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('removes YAML binding when user picks "Remove"', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      setConfig('yaml', 'schemas', { './schema.json': 'data.yaml' });
      vscode.window.activeTextEditor = { document: makeDoc('yaml', path.join(tmp, 'data.yaml')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake(() => 'data.yaml');
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isRemove))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('yaml', 'schemas') as any;
      assert.ok(!stored || !Object.values(stored).some((v: any) =>
        (Array.isArray(v) ? v : [v]).includes('data.yaml')
      ));
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('opens workspace settings after adding JSON binding', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      vscode.window.showInformationMessage.resolves('Open Settings');
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      assert.ok(
        vscode.commands.executeCommand.calledWith('workbench.action.openWorkspaceSettingsFile')
      );
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('opens workspace settings after removing JSON binding', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      setConfig('json', 'schemas', [{ url: './schema.json', fileMatch: ['data.json'] }]);
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake(() => 'data.json');
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isRemove))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      vscode.window.showInformationMessage.resolves('Open Settings');
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      assert.ok(
        vscode.commands.executeCommand.calledWith('workbench.action.openWorkspaceSettingsFile')
      );
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('skips unreadable files in schema discovery', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('json') };
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: '/ws' } });
    // A URI that fs.readFileSync will fail on — should be silently skipped
    vscode.workspace.findFiles.resolves([{ fsPath: '/nonexistent-xyz/schema.json' }]);
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    // Picker still shows (with URL / Browse options) — no crash, no error message
    assert.ok(vscode.window.showQuickPick.calledOnce);
    assert.ok(!vscode.window.showErrorMessage.called);
  });

  test('adds JSON binding with WorkspaceFolder (local project) scope', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp, toString: () => `file://${tmp}` } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('json', 'schemas') as any[];
      assert.ok(Array.isArray(stored));
      assert.ok(stored.some((s: any) => s.fileMatch?.includes('data.json')));
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('replaces existing YAML binding when re-binding the same file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const oldSchema = path.join(tmp, 'old-schema.json');
    const newSchema = path.join(tmp, 'new-schema.json');
    fs.writeFileSync(oldSchema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    fs.writeFileSync(newSchema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      // Pre-seed an existing binding for data.yaml → old-schema.json
      setConfig('yaml', 'schemas', { 'old-schema.json': 'data.yaml' });
      vscode.window.activeTextEditor = { document: makeDoc('yaml', path.join(tmp, 'data.yaml')) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: newSchema }]);
      vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri && (i.uri as any).fsPath === newSchema))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('yaml', 'schemas') as any;
      // Old binding is gone, new binding is present
      assert.ok(!stored || !Object.keys(stored).some((k: string) => k === 'old-schema.json'));
      assert.ok(stored && Object.keys(stored).some((k: string) => k.includes('new-schema.json')));
    } finally {
      fs.unlinkSync(oldSchema);
      fs.unlinkSync(newSchema);
      fs.rmdirSync(tmp);
    }
  });

});
