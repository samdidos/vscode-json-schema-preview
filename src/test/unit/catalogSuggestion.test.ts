import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { setConfig, getStoredConfig } from '../mocks/vscode';

const { CatalogSuggestionProvider } = require('../../CatalogSuggestionProvider');
const { SchemaBindingManager } = require('../../SchemaBindingManager');
const { suggestedEntries } = require('../../schemaCatalog');

function makeDoc(languageId: string, fsPath = '/ws/tsconfig.json', text = '{}') {
  return {
    languageId,
    uri: { fsPath, scheme: 'file', toString: () => `file://${fsPath}` },
    getText: () => text,
    version: 1,
    positionAt: (offset: number) => {
      const lines = text.slice(0, offset).split('\n');
      return { line: lines.length - 1, character: lines[lines.length - 1].length };
    },
  };
}

function makeContext() {
  const store: Record<string, unknown> = {};
  return {
    subscriptions: [] as unknown[],
    workspaceState: {
      get: (key: string, def?: unknown) => (key in store ? store[key] : def),
      update: (key: string, val: unknown) => { store[key] = val; return Promise.resolve(); },
    },
  };
}

const range = (line: number) => ({ start: { line, character: 0 }, end: { line, character: 0 } });

const ENTRIES = [
  { name: 'package.json', url: 'https://json.schemastore.org/package.json', fileMatch: ['package.json'] },
  { name: 'tsconfig.json', url: 'https://json.schemastore.org/tsconfig.json', fileMatch: ['tsconfig.json', 'tsconfig.*.json'] },
  { name: 'tsconfig (mirror)', url: 'https://json.schemastore.org/tsconfig.json', fileMatch: ['tsconfig.json'] },
  { name: 'Any config', url: 'https://example.com/any.json', fileMatch: ['*.json'] },
];

suite('[F12-FR-12] suggestedEntries — catalog matches for one file', () => {
  test('keeps fileMatch hits in catalog order, one per URL', () => {
    const names = suggestedEntries(ENTRIES, 'tsconfig.json').map((e: { name: string }) => e.name);
    assert.deepStrictEqual(names, ['tsconfig.json', 'Any config']);
  });

  test('caps the list', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `s${i}`, url: `https://x/${i}`, fileMatch: ['a.json'] }));
    assert.strictEqual(suggestedEntries(many, 'a.json').length, 3);
    assert.strictEqual(suggestedEntries(many, 'a.json', 1).length, 1);
  });

  test('returns nothing when no entry matches', () => {
    assert.deepStrictEqual(suggestedEntries(ENTRIES, 'data.yaml'), []);
  });
});

suite('[F12-FR-12] CatalogSuggestionProvider — Bind suggested schema', () => {
  setup(() => {
    vscode.resetAll();
    vscode.workspace.asRelativePath.callsFake(() => 'tsconfig.json');
  });

  const provider = () => new CatalogSuggestionProvider({ getCachedEntries: () => ENTRIES });

  test('offers one action per suggested schema on an unbound matching file', () => {
    const doc = makeDoc('json');
    const actions = provider().provideCodeActions(doc, range(0));
    assert.deepStrictEqual(actions.map((a: { title: string }) => a.title), [
      'Bind suggested schema "tsconfig.json"',
      'Bind suggested schema "Any config"',
    ]);
    assert.deepStrictEqual(actions[0].command, {
      command: 'jsonschema.bindToCurrentFile',
      title: 'Bind Schema',
      arguments: [doc.uri, 'https://json.schemastore.org/tsconfig.json'],
    });
    assert.strictEqual(actions[0].edit, undefined, 'the action itself never writes a binding');
  });

  test('offers nothing for a file with an inline $schema', () => {
    const doc = makeDoc('json', '/ws/tsconfig.json', '{ "$schema": "./my.schema.json" }');
    assert.deepStrictEqual(provider().provideCodeActions(doc, range(0)), []);
  });

  test('offers nothing for a file with a settings binding', () => {
    setConfig('json', 'schemas', [{ fileMatch: ['tsconfig.json'], url: './x.schema.json' }]);
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: '/ws' } });
    assert.deepStrictEqual(provider().provideCodeActions(makeDoc('json'), range(0)), []);
  });

  test('offers nothing for unsupported languages', () => {
    assert.deepStrictEqual(provider().provideCodeActions(makeDoc('typescript'), range(0)), []);
  });

  test('offers nothing when no cached entry matches', () => {
    vscode.workspace.asRelativePath.callsFake(() => 'config.yaml');
    assert.deepStrictEqual(provider().provideCodeActions(makeDoc('yaml', '/ws/config.yaml', 'a: 1'), range(0)), []);
  });
});

suite('[F12-FR-13] CatalogSuggestionProvider — first line, cache only', () => {
  setup(() => {
    vscode.resetAll();
    vscode.workspace.asRelativePath.callsFake(() => 'tsconfig.json');
  });

  test('is offered only when the range starts on the first line', () => {
    const p = new CatalogSuggestionProvider({ getCachedEntries: () => ENTRIES });
    assert.strictEqual(p.provideCodeActions(makeDoc('json'), range(0)).length, 2);
    assert.deepStrictEqual(p.provideCodeActions(makeDoc('json'), range(3)), []);
  });

  test('reads only the catalog cache — the port has no fetch to call', () => {
    let reads = 0;
    const p = new CatalogSuggestionProvider({ getCachedEntries: () => { reads++; return []; } });
    assert.deepStrictEqual(p.provideCodeActions(makeDoc('json'), range(0)), []);
    assert.strictEqual(reads, 1);
  });
});

suite('[F12-FR-12] bindToCurrentFile with a preset schema reference', () => {
  setup(() => vscode.resetAll());

  test('skips the source picker and binds after the user picks a scope', async () => {
    const doc = makeDoc('json', '/ws/tsconfig.json');
    vscode.workspace.openTextDocument.resolves(doc);
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: '/ws' } });
    vscode.workspace.asRelativePath.callsFake(() => 'tsconfig.json');
    vscode.window.showQuickPick.callsFake(async (items: Array<{ target?: unknown }>) =>
      items.find(i => i.target === vscode.ConfigurationTarget.WorkspaceFolder));

    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile(doc.uri, 'https://json.schemastore.org/tsconfig.json');

    assert.strictEqual(vscode.window.showQuickPick.callCount, 1, 'only the scope picker is shown');
    const stored = getStoredConfig('json', 'schemas') as Array<{ fileMatch: string[]; url: string }>;
    assert.ok(stored.some(s => s.url === 'https://json.schemastore.org/tsconfig.json' && s.fileMatch.includes('tsconfig.json')));
  });

  test('writes nothing when the scope picker is dismissed', async () => {
    const doc = makeDoc('json', '/ws/tsconfig.json');
    vscode.workspace.openTextDocument.resolves(doc);
    vscode.window.showQuickPick.resolves(undefined);
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile(doc.uri, 'https://json.schemastore.org/tsconfig.json');
    assert.strictEqual(getStoredConfig('json', 'schemas'), undefined);
  });

  test('ignores a non-string second argument (explorer multi-select passes a URI array)', async () => {
    const doc = makeDoc('json', '/ws/tsconfig.json');
    vscode.workspace.openTextDocument.resolves(doc);
    vscode.window.showQuickPick.resolves(undefined);
    const mgr = new SchemaBindingManager(makeContext());
    await mgr.bindToCurrentFile(doc.uri, [doc.uri] as never);
    const [items] = vscode.window.showQuickPick.firstCall.args as [Array<{ isUrl?: boolean }>];
    assert.ok(items.some(i => i.isUrl), 'the full source picker is shown, not the scope picker');
  });
});
