import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { setConfig } from '../mocks/vscode';

const { SchemaCatalogManager, buildItems } = require('../../SchemaCatalogManager');

const STORE = 'https://www.schemastore.org/api/json/catalog.json';

function makeContext(initial: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initial };
  return {
    globalState: {
      get: (k: string, d?: any) => (k in store ? store[k] : d),
      update: (k: string, v: any) => { store[k] = v; return Promise.resolve(); },
    },
    _store: store,
  };
}

function catalogJson(...names: string[]) {
  return JSON.stringify({ schemas: names.map(n => ({ name: n, url: `https://x/${n}.json`, fileMatch: [`${n}.json`] })) });
}

setup(() => vscode.resetAll());

suite('[F12-FR-03][F12-FR-05] SchemaCatalogManager.loadEntries() — fetching', () => {
  test('fetches the SchemaStore catalog and returns its entries', async () => {
    const auth = { fetchText: async (_u: string) => catalogJson('package', 'tsconfig') };
    const mgr = new SchemaCatalogManager(makeContext(), auth as any);
    const { suggested, rest, warnings } = await mgr.loadEntries('other.txt');
    assert.strictEqual(warnings.length, 0);
    assert.deepStrictEqual([...suggested, ...rest].map((e: any) => e.name).sort(), ['package', 'tsconfig']);
  });

  test('[F12-FR-04] merges user-configured private catalogs', async () => {
    setConfig('jsonschema.catalog', 'useSchemaStore', false);
    setConfig('jsonschema.catalog', 'sources', ['https://corp/catalog.json']);
    const auth = { fetchText: async (u: string) => u === 'https://corp/catalog.json' ? catalogJson('internal') : '{}' };
    const mgr = new SchemaCatalogManager(makeContext(), auth as any);
    const { suggested, rest } = await mgr.loadEntries('x');
    const all = [...suggested, ...rest];
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].name, 'internal');
    assert.strictEqual(all[0].source, 'https://corp/catalog.json');
  });

  test('[F12-FR-06] a catalog that fails to parse yields a warning, not a throw', async () => {
    const auth = { fetchText: async (_u: string) => 'not json' };
    const mgr = new SchemaCatalogManager(makeContext(), auth as any);
    const { warnings, suggested, rest } = await mgr.loadEntries('x');
    assert.strictEqual(suggested.length + rest.length, 0);
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /schemastore\.org/);
  });

  test('[F12-FR-08] fileMatch-matching entries are ranked as suggested', async () => {
    const auth = { fetchText: async (_u: string) => catalogJson('package', 'tsconfig') };
    const mgr = new SchemaCatalogManager(makeContext(), auth as any);
    const { suggested } = await mgr.loadEntries('package.json');
    assert.deepStrictEqual(suggested.map((e: any) => e.name), ['package']);
  });
});

suite('[F12-FR-10][F12-FR-11] SchemaCatalogManager — caching', () => {
  test('[F12-FR-10] a fresh cache entry is served without hitting the network', async () => {
    const ctx = makeContext({
      'jsonschema.catalogCache': { [STORE]: { fetchedAt: Date.now(), entries: [{ name: 'cached', url: 'u' }] } },
    });
    let fetched = false;
    const auth = { fetchText: async (_u: string) => { fetched = true; return catalogJson('fresh'); } };
    const mgr = new SchemaCatalogManager(ctx, auth as any);
    const { rest } = await mgr.loadEntries('x');
    assert.strictEqual(fetched, false, 'must not fetch within the TTL');
    assert.strictEqual(rest[0].name, 'cached');
  });

  test('refetches once the cache entry is older than 24 h', async () => {
    const ctx = makeContext({
      'jsonschema.catalogCache': { [STORE]: { fetchedAt: Date.now() - 25 * 3600_000, entries: [{ name: 'old', url: 'u' }] } },
    });
    const auth = { fetchText: async (_u: string) => catalogJson('fresh') };
    const mgr = new SchemaCatalogManager(ctx, auth as any);
    const { suggested, rest } = await mgr.loadEntries('x');
    assert.deepStrictEqual([...suggested, ...rest].map((e: any) => e.name), ['fresh']);
  });

  test('[F12-FR-11] falls back to a stale cache when the fetch fails, flagging staleness', async () => {
    const ctx = makeContext({
      'jsonschema.catalogCache': { [STORE]: { fetchedAt: Date.now() - 25 * 3600_000, entries: [{ name: 'stale', url: 'u' }] } },
    });
    const auth = { fetchText: async (_u: string) => { throw new Error('offline'); } };
    const mgr = new SchemaCatalogManager(ctx, auth as any);
    const { rest, stale, warnings } = await mgr.loadEntries('x');
    assert.strictEqual(rest[0].name, 'stale');
    assert.strictEqual(stale, true);
    assert.strictEqual(warnings.length, 0);
  });
});

suite('[F12-FR-07] buildItems()', () => {
  test('places suggested entries under a separator, then the rest', () => {
    const items = buildItems(
      [{ name: 'S1', url: 'u1', source: 'https://a/c.json' }],
      [{ name: 'R1', url: 'u2' }],
    );
    assert.strictEqual(items[0].kind, vscode.QuickPickItemKind.Separator);
    assert.strictEqual(items[0].label, 'Suggested for this file');
    assert.strictEqual(items[1].label, 'S1');
    assert.strictEqual(items[1].url, 'u1');
    assert.ok(items.some((i: any) => i.label === 'All schemas' && i.kind === vscode.QuickPickItemKind.Separator));
    assert.ok(items.some((i: any) => i.label === 'R1'));
  });

  test('no suggested separator when there are no suggestions', () => {
    const items = buildItems([], [{ name: 'R1', url: 'u2' }]);
    assert.ok(!items.some((i: any) => i.label === 'Suggested for this file'));
    assert.strictEqual(items[0].label, 'R1');
  });
});

suite('[F12-NFR-01] SchemaCatalogManager.browse()', () => {
  test('opens a busy QuickPick and returns the accepted entry URL', async () => {
    const auth = { fetchText: async (_u: string) => catalogJson('package') };
    const mgr = new SchemaCatalogManager(makeContext(), auth as any);
    const p = mgr.browse('package.json');
    const qp = vscode.window.createQuickPick.returnValues[0];
    assert.ok(qp.show.called);
    // Let loadEntries resolve and populate items.
    await new Promise(r => setImmediate(r));
    assert.strictEqual(qp.busy, false);
    assert.ok(qp.items.some((i: any) => i.url === 'https://x/package.json'));
    // Simulate the user picking the package entry.
    qp.selectedItems = [qp.items.find((i: any) => i.url === 'https://x/package.json')];
    qp._accept();
    assert.strictEqual(await p, 'https://x/package.json');
  });

  test('returns undefined when the picker is dismissed', async () => {
    const auth = { fetchText: async (_u: string) => catalogJson('package') };
    const mgr = new SchemaCatalogManager(makeContext(), auth as any);
    const p = mgr.browse('x');
    const qp = vscode.window.createQuickPick.returnValues[0];
    await new Promise(r => setImmediate(r));
    qp._hide();
    assert.strictEqual(await p, undefined);
  });

  test('[F12-FR-11] marks the title stale on offline fallback', async () => {
    const ctx = makeContext({
      'jsonschema.catalogCache': { [STORE]: { fetchedAt: Date.now() - 25 * 3600_000, entries: [{ name: 'stale', url: 'u' }] } },
    });
    const auth = { fetchText: async (_u: string) => { throw new Error('offline'); } };
    const mgr = new SchemaCatalogManager(ctx, auth as any);
    const p = mgr.browse('x');
    const qp = vscode.window.createQuickPick.returnValues[0];
    await new Promise(r => setImmediate(r));
    assert.match(qp.title, /offline/i);
    qp._hide();
    await p;
  });
});
