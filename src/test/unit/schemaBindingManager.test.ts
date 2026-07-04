import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';
import { setConfig, getStoredConfig, statusBarItem } from '../mocks/vscode';

const {
  SchemaBindingManager,
  INLINE_SCOPE,
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

function makeDoc(languageId: string, fsPath = '/ws/data.json', text = '') {
  return {
    languageId,
    uri: { fsPath },
    getText: () => text,
    // Mirrors vscode.TextDocument.positionAt closely enough for the mock
    // WorkspaceEdit ranges built in SchemaBindingManager's inline-write path.
    positionAt: (offset: number) => {
      const before = text.slice(0, offset);
      const lines = before.split('\n');
      return { line: lines.length - 1, character: lines[lines.length - 1].length };
    },
  };
}

/** Reconstructs the text produced by applying a mock vscode.WorkspaceEdit's
 *  recorded replace() ops back onto the original string, so inline-binding
 *  tests can assert on the actual resulting file content. */
function applyMockEdit(text: string, edit: { edits: { range: any; newText: string }[] }): string {
  function offsetOf(line: number, character: number): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < line; i++) offset += lines[i].length + 1;
    return offset + character;
  }
  const ops = edit.edits
    .map(e => ({
      start: offsetOf(e.range.startLine, e.range.startChar),
      end: offsetOf(e.range.endLine, e.range.endChar),
      newText: e.newText,
    }))
    .sort((a, b) => b.start - a.start);
  let result = text;
  for (const op of ops) result = result.slice(0, op.start) + op.newText + result.slice(op.end);
  return result;
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

  test('[F04-FR-05][F04-FR-07] shows "unbound" when JSON file has no binding', () => {
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

  test('[F04-FR-06] shows schema name when JSON binding exists', () => {
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

  test('[F04-FR-01][F04-FR-03] adds JSON binding when user picks schema', async () => {
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

  test('[F04-FR-04] adds YAML binding when user picks schema', async () => {
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

  test('[F04-FR-02] adds JSON binding with WorkspaceFolder (local project) scope', async () => {
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

// ─── Local schema-path resolution by scope [Bug: workspace-file path] ─────────

suite('SchemaBindingManager — local schema path resolution by scope', () => {
  setup(() => vscode.resetAll());

  function setUpWorkspaceSchemaPick(tmp: string, schema: string) {
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
    vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
    vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
    vscode.window.showQuickPick.onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri));
  }

  test('[F04-FR-13] WorkspaceFolder scope stores a relative ./ path', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      setUpWorkspaceSchemaPick(tmp, schema);
      vscode.window.showQuickPick
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.WorkspaceFolder));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('json', 'schemas') as any[];
      const entry = stored.find((s: any) => s.fileMatch?.includes('data.json'));
      assert.strictEqual(entry.url, './schema.json');
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('[F04-FR-13] Workspace (.code-workspace) scope stores the absolute path, not a relative one', async () => {
    // Relative json.schemas/yaml.schemas urls are unreliable once the setting
    // lives outside a single folder's own .vscode/settings.json — see
    // microsoft/vscode#156006 and #181187. Using the absolute path sidesteps
    // that VS Code core bug entirely.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      (vscode.workspace as any).workspaceFile = { fsPath: path.join(tmp, 'proj.code-workspace') };
      setUpWorkspaceSchemaPick(tmp, schema);
      vscode.window.showQuickPick
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.Workspace));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('json', 'schemas') as any[];
      const entry = stored.find((s: any) => s.fileMatch?.includes('data.json'));
      assert.strictEqual(entry.url, schema);
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('[F04-FR-13] Global (User) scope stores the absolute path — there is no folder to resolve a relative path against', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json')) };
      setUpWorkspaceSchemaPick(tmp, schema);
      vscode.window.showQuickPick
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.Global));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('json', 'schemas') as any[];
      const entry = stored.find((s: any) => s.fileMatch?.includes('data.json'));
      assert.strictEqual(entry.url, schema);
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('[F04-FR-13] multi-root workspace: Workspace scope stores an absolute path for a schema in a different project folder, and fileMatch is folder-prefixed', async () => {
    // Two real, distinct project folders — the scenario the bug report actually
    // described ("workspace file with multiple projects coming from different
    // folders") — rather than the placeholder `[{}, {}]` arrays used elsewhere
    // just to flip the isMultiRoot boolean.
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-projA-'));
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-projB-'));
    const schema = path.join(tmpB, 'schema.json'); // lives in the *other* project
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      const docPath = path.join(tmpA, 'data.json');
      vscode.window.activeTextEditor = { document: makeDoc('json', docPath) };
      (vscode.workspace as any).workspaceFile = { fsPath: path.join(os.tmpdir(), 'multi-root.code-workspace') };
      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: tmpA }, name: 'projA' },
        { uri: { fsPath: tmpB }, name: 'projB' },
      ] as any;
      // Mirrors real VS Code: resolve whichever folder actually contains the path.
      vscode.workspace.getWorkspaceFolder.callsFake((u: any) => {
        const p = typeof u === 'string' ? u : u.fsPath;
        if (p.startsWith(tmpA)) return { uri: { fsPath: tmpA }, name: 'projA' };
        if (p.startsWith(tmpB)) return { uri: { fsPath: tmpB }, name: 'projB' };
        return undefined;
      });
      vscode.workspace.asRelativePath.callsFake((u: any, includeFolder?: boolean) => {
        const p = typeof u === 'string' ? u : u.fsPath;
        if (p.startsWith(tmpA)) return includeFolder ? `projA/${path.relative(tmpA, p)}` : path.relative(tmpA, p);
        if (p.startsWith(tmpB)) return includeFolder ? `projB/${path.relative(tmpB, p)}` : path.relative(tmpB, p);
        return p;
      });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === vscode.ConfigurationTarget.Workspace));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const stored = getStoredConfig('json', 'schemas') as any[];
      const entry = stored.find((s: any) => s.fileMatch?.includes('projA/data.json'));
      assert.ok(entry, "fileMatch is folder-prefixed ('projA/data.json') for the doc's own folder in a multi-root workspace");
      assert.strictEqual(entry.url, schema, 'schema url is the absolute path even though the schema lives in a different project folder than the doc');
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmpA);
      fs.rmdirSync(tmpB);
    }
  });
});

// ─── Inline binding — integration via bindToCurrentFile [F10] ─────────────────

suite('SchemaBindingManager — inline binding (F10)', () => {
  setup(() => vscode.resetAll());

  test('[F10-FR-01][F10-FR-04][F10-NFR-01] Inline scope inserts $schema as the first key for JSON', async () => {
    const text = '{\n  "a": 1\n}';
    vscode.window.activeTextEditor = { document: makeDoc('json', '/ws/data.json', text) };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
    vscode.window.showInputBox.resolves('https://example.com/schema.json');
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(vscode.workspace.applyEdit.calledOnce);
    const result = applyMockEdit(text, vscode.workspace.applyEdit.firstCall.args[0]);
    assert.deepStrictEqual(JSON.parse(result), { $schema: 'https://example.com/schema.json', a: 1 });
    assert.ok(result.trimStart().startsWith('{\n  "$schema"'));
  });

  test('[F10-FR-02] Inline option is not offered for JSONL files', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('jsonl', '/ws/data.jsonl', '{"a":1}\n') };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    let scopeItems: any[] = [];
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => { scopeItems = items; return undefined; });
    vscode.window.showInputBox.resolves('https://example.com/schema.json');
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(!scopeItems.some((i: any) => i.target === INLINE_SCOPE));
  });

  test('[F10-FR-03] Remove picker omits Inline when the file has no inline $schema', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('json', '/ws/data.json', '{"a":1}') };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    let scopeItems: any[] = [];
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isRemove))
      .onSecondCall().callsFake(async (items: any[]) => { scopeItems = items; return undefined; });
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(!scopeItems.some((i: any) => i.target === INLINE_SCOPE));
  });

  test('[F10-FR-03][F10-FR-10][F10-FR-11] Remove picker offers Inline and removes $schema when present', async () => {
    const text = '{\n  "$schema": "./s.json",\n  "a": 1\n}';
    vscode.window.activeTextEditor = { document: makeDoc('json', '/ws/data.json', text) };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isRemove))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(vscode.workspace.applyEdit.calledOnce);
    const result = applyMockEdit(text, vscode.workspace.applyEdit.firstCall.args[0]);
    assert.deepStrictEqual(JSON.parse(result), { a: 1 });
  });

  test('[F10-FR-06] Inline binding on a JSON array root shows an error and does not modify anything', async () => {
    const text = '[1,2,3]';
    vscode.window.activeTextEditor = { document: makeDoc('json', '/ws/data.json', text) };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
    vscode.window.showInputBox.resolves('https://example.com/schema.json');
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(!vscode.workspace.applyEdit.called);
    assert.ok(vscode.window.showErrorMessage.calledOnce);
  });

  test('[F10-FR-09] Inline YAML binding writes a directive when redhat.vscode-yaml is installed', async () => {
    const text = 'foo: 1\n';
    vscode.window.activeTextEditor = { document: makeDoc('yaml', '/ws/data.yaml', text) };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    vscode.extensions.getExtension.returns({ id: 'redhat.vscode-yaml' });
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
    vscode.window.showInputBox.resolves('https://example.com/schema.json');
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    const result = applyMockEdit(text, vscode.workspace.applyEdit.firstCall.args[0]);
    assert.strictEqual(result, '# yaml-language-server: $schema=https://example.com/schema.json\nfoo: 1\n');
  });

  test('[F10-FR-09] Inline YAML binding writes a plain key when redhat.vscode-yaml is absent', async () => {
    const text = 'foo: 1\n';
    vscode.window.activeTextEditor = { document: makeDoc('yaml', '/ws/data.yaml', text) };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
    vscode.window.showInputBox.resolves('https://example.com/schema.json');
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    const result = applyMockEdit(text, vscode.workspace.applyEdit.firstCall.args[0]);
    assert.strictEqual(result, '$schema: https://example.com/schema.json\nfoo: 1\n');
  });

  test('[Workspace trust] Inline binding is blocked in untrusted workspaces', async () => {
    (vscode.workspace as any).isTrusted = false;
    vscode.window.activeTextEditor = { document: makeDoc('json', '/ws/data.json', '{"a":1}') };
    vscode.workspace.getWorkspaceFolder.returns(undefined);
    vscode.workspace.findFiles.resolves([]);
    vscode.window.showQuickPick
      .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.isUrl))
      .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
    vscode.window.showInputBox.resolves('https://example.com/schema.json');
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile();
    assert.ok(!vscode.workspace.applyEdit.called);
    assert.ok(vscode.window.showWarningMessage.called);
  });

  test('[F10-FR-05] Inline binding uses a relative path for a schema inside the same workspace folder', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      const text = '{"a":1}';
      vscode.window.activeTextEditor = { document: makeDoc('json', path.join(tmp, 'data.json'), text) };
      vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmp } });
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.workspace.asRelativePath.callsFake((u: any) => path.basename(typeof u === 'string' ? u : u.fsPath));
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const result = applyMockEdit(text, vscode.workspace.applyEdit.firstCall.args[0]);
      assert.deepStrictEqual(JSON.parse(result), { $schema: './schema.json', a: 1 });
      assert.ok(!vscode.window.showInformationMessage.called);
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });

  test('[F10-FR-05] Inline binding uses an absolute path and warns when the schema is outside the workspace', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsb-'));
    const schema = path.join(tmp, 'schema.json');
    fs.writeFileSync(schema, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    try {
      const text = '{"a":1}';
      vscode.window.activeTextEditor = { document: makeDoc('json', '/ws/data.json', text) };
      // Neither the doc nor the picked schema resolve to a workspace folder.
      vscode.workspace.getWorkspaceFolder.returns(undefined);
      vscode.workspace.findFiles.resolves([{ fsPath: schema }]);
      vscode.window.showQuickPick
        .onFirstCall().callsFake(async (items: any[]) => items.find((i: any) => i.uri))
        .onSecondCall().callsFake(async (items: any[]) => items.find((i: any) => i.target === INLINE_SCOPE));
      const mgr = new SchemaBindingManager(makeContext());
      await mgr.bindToCurrentFile();
      const result = applyMockEdit(text, vscode.workspace.applyEdit.firstCall.args[0]);
      assert.deepStrictEqual(JSON.parse(result), { $schema: schema, a: 1 });
      assert.ok(vscode.window.showInformationMessage.calledOnce);
    } finally {
      fs.unlinkSync(schema);
      fs.rmdirSync(tmp);
    }
  });
});

// ─── refresh() inline precedence [F10-FR-12][F10-FR-13][F10-FR-15] ────────────

suite('SchemaBindingManager — refresh() inline precedence', () => {
  setup(() => vscode.resetAll());

  function trigger(doc: any) {
    new SchemaBindingManager(makeContext());
    const cb = vscode.window.onDidChangeActiveTextEditor.lastCall.args[0];
    cb({ document: doc });
  }

  test('inline $schema takes precedence over a settings binding and shows the inline icon', () => {
    setConfig('json', 'schemas', [{ url: './other.json', fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    trigger(makeDoc('json', '/ws/data.json', '{"$schema":"./inline.json","a":1}'));
    assert.ok(statusBarItem.text.includes('file-symlink-file'));
    assert.ok(statusBarItem.text.includes('inline.json'));
    assert.ok(statusBarItem.tooltip?.includes('other.json'));
  });

  test('shows the inline icon when there is no settings binding at all', () => {
    setConfig('json', 'schemas', []);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    trigger(makeDoc('json', '/ws/data.json', '{"$schema":"./inline.json"}'));
    assert.ok(statusBarItem.text.includes('inline.json'));
    assert.ok(!statusBarItem.tooltip?.includes('Note:'));
  });
});
