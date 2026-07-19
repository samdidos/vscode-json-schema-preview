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
  return {
    fetchText: async (_url: string) => content,
    // download() captures validators via fetchConditional; mirror fetchText.
    fetchConditional: async (_url: string) => ({ status: 200, text: content }),
  };
}

/**
 * Scriptable auth double for revalidation tests: each call to fetchConditional
 * shifts the next queued response (or reuses the last). Records the validators
 * it was asked to send so conditional-request behaviour can be asserted.
 */
function scriptedAuth(responses: any[]) {
  const calls: any[] = [];
  const queue = [...responses];
  return {
    calls,
    fetchText: async (_url: string) => JSON.stringify({}),
    fetchConditional: async (_url: string, _t?: number, validators?: any) => {
      calls.push(validators);
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) { throw next; }
      return next;
    },
  };
}

suite('[F08-FR-01][F08-FR-02] SchemaCache.download()', () => {
  let ctx: ReturnType<typeof makeContext>;
  teardown(() => { if (ctx) {fs.rmSync(ctx._dir, { recursive: true, force: true });} });

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

  test('[F08-FR-18] a YAML-origin schema is re-serialized to canonical JSON before being cached', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('type: object\nproperties:\n  name:\n    type: string\n'));
    const localPath = await cache.download('https://example.com/schema.yaml');
    const cached = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    assert.deepStrictEqual(cached, { type: 'object', properties: { name: { type: 'string' } } });
  });

  test('[F08-FR-18] refuses to cache unparseable content and does not write anything', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, fakeAuth('{ this is not json'));
    await assert.rejects(
      () => cache.download('https://example.com/schema.json'),
      /not valid JSON\/YAML/,
    );
    assert.strictEqual(cache.isCached('https://example.com/schema.json'), false);
  });
});

suite('[F08-FR-03] SchemaCache.isCached() / getOriginalUrl()', () => {
  let ctx: ReturnType<typeof makeContext>;
  teardown(() => { if (ctx) {fs.rmSync(ctx._dir, { recursive: true, force: true });} });

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

suite('[F08-FR-14][F08-FR-15][F08-FR-16][F08-FR-17] SchemaCache.revalidate()', () => {
  let ctx: ReturnType<typeof makeContext>;
  teardown(() => { if (ctx) {fs.rmSync(ctx._dir, { recursive: true, force: true });} });

  test('[F08-FR-14] returns "no-entry" when nothing is cached for the URL', async () => {
    ctx = makeContext();
    const cache = new SchemaCache(ctx, scriptedAuth([{ status: 200, text: '{}' }]));
    assert.strictEqual(await cache.revalidate('https://example.com/x.json', 'onOpen'), 'no-entry');
  });

  test('[F08-FR-16] download() persists the ETag so the next revalidation is conditional', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([
      { status: 200, text: '{"v":1}', etag: 'W/"abc"' },      // initial download
      { status: 304, etag: 'W/"abc"' },                          // revalidation
    ]);
    const cache = new SchemaCache(ctx, auth);
    await cache.download('https://example.com/s.json');
    await cache.revalidate('https://example.com/s.json', 'onOpen');
    // Second fetchConditional call was asked to send the stored ETag.
    assert.deepStrictEqual(auth.calls[1], { etag: 'W/"abc"', lastModified: undefined });
  });

  test('[F08-FR-15] a 304 leaves the cache file byte-for-byte unchanged', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([
      { status: 200, text: '{"v":1}', etag: '"e1"' },
      { status: 304, etag: '"e1"' },
    ]);
    const cache = new SchemaCache(ctx, auth);
    const localPath = await cache.download('https://example.com/s.json');
    const before = fs.readFileSync(localPath, 'utf-8');
    const outcome = await cache.revalidate('https://example.com/s.json', 'onOpen');
    assert.strictEqual(outcome, 'not-modified');
    assert.strictEqual(fs.readFileSync(localPath, 'utf-8'), before);
  });

  test('[F08-FR-15] a 200 overwrites the cache file with the fresh body', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([
      { status: 200, text: '{"v":1}', etag: '"e1"' },
      { status: 200, text: '{"v":2}', etag: '"e2"' },
    ]);
    const cache = new SchemaCache(ctx, auth);
    const localPath = await cache.download('https://example.com/s.json');
    const outcome = await cache.revalidate('https://example.com/s.json', 'onOpen');
    assert.strictEqual(outcome, 'updated');
    assert.strictEqual(fs.readFileSync(localPath, 'utf-8'), '{"v":2}');
  });

  test('[F08-FR-17] a failed revalidation is swallowed and leaves the stale copy', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([
      { status: 200, text: '{"v":1}' },
      new Error('getaddrinfo ENOTFOUND example.com'),
    ]);
    const cache = new SchemaCache(ctx, auth);
    const localPath = await cache.download('https://example.com/s.json');
    const outcome = await cache.revalidate('https://example.com/s.json', 'onOpen');
    assert.strictEqual(outcome, 'failed');
    assert.strictEqual(fs.readFileSync(localPath, 'utf-8'), '{"v":1}');
  });

  test('[F08-FR-17][F08-FR-18] a revalidation fetching unparseable content is treated as failed, stale copy kept', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([
      { status: 200, text: '{"v":1}' },
      { status: 200, text: '{ not json', etag: '"e2"' },
    ]);
    const cache = new SchemaCache(ctx, auth);
    const localPath = await cache.download('https://example.com/s.json');
    const outcome = await cache.revalidate('https://example.com/s.json', 'onOpen');
    assert.strictEqual(outcome, 'failed');
    assert.strictEqual(fs.readFileSync(localPath, 'utf-8'), '{"v":1}');
  });

  test('[F08-FR-14] "daily" mode skips a revalidation within the 24 h window', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([{ status: 200, text: '{"v":1}' }]);
    const cache = new SchemaCache(ctx, auth);
    await cache.download('https://example.com/s.json'); // fetchedAt = now
    const outcome = await cache.revalidate('https://example.com/s.json', 'daily');
    assert.strictEqual(outcome, 'skipped');
    assert.strictEqual(auth.calls.length, 1); // no second network call
  });

  test('[F08-FR-14] "daily" mode revalidates once the entry is older than 24 h', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([
      { status: 200, text: '{"v":1}' },
      { status: 304 },
    ]);
    const cache = new SchemaCache(ctx, auth);
    await cache.download('https://example.com/s.json');
    // Age the stored entry past the 24 h throttle.
    const stored = ctx.globalState.get('schemaauth.cache', []);
    stored[0].fetchedAt = Date.now() - (25 * 60 * 60 * 1000);
    await ctx.globalState.update('schemaauth.cache', stored);
    const outcome = await cache.revalidate('https://example.com/s.json', 'daily');
    assert.strictEqual(outcome, 'not-modified');
  });

  test('[F08-FR-14][F08-FR-19] returns "no-entry" if the cached file was deleted out-of-band', async () => {
    ctx = makeContext();
    const auth = scriptedAuth([{ status: 200, text: '{}' }]);
    const cache = new SchemaCache(ctx, auth);
    const localPath = await cache.download('https://example.com/s.json');
    fs.unlinkSync(localPath);
    assert.strictEqual(await cache.revalidate('https://example.com/s.json', 'onOpen'), 'no-entry');
  });
});

suite('[S04-SR-01] SchemaCache.readCached()', () => {
  let ctx: ReturnType<typeof makeContext>;
  teardown(() => { if (ctx) {fs.rmSync(ctx._dir, { recursive: true, force: true });} });

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
