import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { SchemaCache } = require('../../SchemaCache');

/** In-memory globalState + a real temp dir for globalStorageUri, mirroring VS Code's ExtensionContext shape. */
function makeContext() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-cache-test-'));
  const store: Record<string, any> = {};
  return {
    globalStorageUri: { fsPath: dir },
    globalState: {
      get: (key: string, def?: any) => (key in store ? store[key] : def),
      update: (key: string, val: any) => { store[key] = val; return Promise.resolve(); },
    },
    _dir: dir,
  };
}

function fakeAuth(content: string) {
  return { fetchText: async (_url: string) => content };
}

suite('[F08-FR-01][F08-FR-02] SchemaCache.download()', () => {
  let ctx: ReturnType<typeof makeContext>;
  teardown(() => { if (ctx) fs.rmSync(ctx._dir, { recursive: true, force: true }); });

  test('writes the fetched content to a stable local path and returns it', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{"type":"object"}'));
    const localPath = await cache.download('https://example.com/schema.json');
    assert.ok(fs.existsSync(localPath));
    assert.strictEqual(fs.readFileSync(localPath, 'utf-8'), '{"type":"object"}');
  });

  test('creates the cache directory if it does not yet exist', async () => {
    ctx = makeContext();
    fs.rmSync(ctx._dir, { recursive: true, force: true });
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    const localPath = await cache.download('https://example.com/schema.json');
    assert.ok(fs.existsSync(localPath));
  });

  test('[F08-FR-08] re-downloading the same URL overwrites the same local path', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{"v":1}'));
    const first = await cache.download('https://example.com/schema.json');
    const cache2 = new SchemaCache(ctx, fakeAuth('{"v":2}'));
    const second = await cache2.download('https://example.com/schema.json');
    assert.strictEqual(first, second);
    assert.strictEqual(fs.readFileSync(second, 'utf-8'), '{"v":2}');
  });
});

suite('[F08-FR-03] SchemaCache.isCached() / getOriginalUrl()', () => {
  let ctx: ReturnType<typeof makeContext>;
  teardown(() => { if (ctx) fs.rmSync(ctx._dir, { recursive: true, force: true }); });

  test('isCached() is false before download and true after', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    assert.strictEqual(cache.isCached('https://example.com/s.json'), false);
    await cache.download('https://example.com/s.json');
    assert.strictEqual(cache.isCached('https://example.com/s.json'), true);
  });

  test('isCached() is false if the recorded entry exists but the file was deleted', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    const localPath = await cache.download('https://example.com/s.json');
    fs.unlinkSync(localPath);
    assert.strictEqual(cache.isCached('https://example.com/s.json'), false);
  });

  test('getOriginalUrl() resolves an absolute local path back to its remote URL', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    const localPath = await cache.download('https://example.com/s.json');
    assert.strictEqual(cache.getOriginalUrl(localPath), 'https://example.com/s.json');
  });

  test('getOriginalUrl() also accepts a file:// URI for the same path', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    const localPath = await cache.download('https://example.com/s.json');
    const fileUri = `file://${localPath}`;
    assert.strictEqual(cache.getOriginalUrl(fileUri), 'https://example.com/s.json');
  });

  test('getOriginalUrl() returns undefined for an unknown path', () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    assert.strictEqual(cache.getOriginalUrl('/nowhere/schema.json'), undefined);
  });

  test('two different URLs are tracked independently', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    const a = await cache.download('https://example.com/a.json');
    const cacheB = new SchemaCache(ctx, fakeAuth('{}'));
    const b = await cacheB.download('https://example.com/b.json');
    assert.notStrictEqual(a, b);
    assert.strictEqual(cache.getOriginalUrl(a), 'https://example.com/a.json');
    assert.strictEqual(cache.getOriginalUrl(b), 'https://example.com/b.json');
  });
});

suite('[S04-SR-01] SchemaCache.readCached()', () => {
  let ctx: ReturnType<typeof makeContext>;
  teardown(() => { if (ctx) fs.rmSync(ctx._dir, { recursive: true, force: true }); });

  test('returns the cached content for a downloaded URL', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{"cached":true}'));
    await cache.download('https://example.com/s.json');
    assert.strictEqual(cache.readCached('https://example.com/s.json'), '{"cached":true}');
  });

  test('returns undefined for a URL that was never cached', () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    assert.strictEqual(cache.readCached('https://example.com/never.json'), undefined);
  });

  test('returns undefined if the recorded file was deleted out-of-band', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{}'));
    const localPath = await cache.download('https://example.com/s.json');
    fs.unlinkSync(localPath);
    assert.strictEqual(cache.readCached('https://example.com/s.json'), undefined);
  });
});
