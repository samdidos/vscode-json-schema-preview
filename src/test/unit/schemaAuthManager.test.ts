import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from '../mocks/vscode';

const { SchemaAuthManager, AuthRequiredError } = require('../../SchemaAuthManager');

/** In-memory SecretStorage-shaped context, mirroring VS Code's ExtensionContext.secrets. */
function makeContext(opts: { rejectGet?: boolean } = {}) {
  const store: Record<string, string> = {};
  return {
    secrets: {
      get: (key: string) => opts.rejectGet
        ? Promise.reject(new Error('no keyring available'))
        : Promise.resolve(store[key]),
      store: (key: string, value: string) => { store[key] = value; return Promise.resolve(); },
      delete: (key: string) => { delete store[key]; return Promise.resolve(); },
    },
    _store: store,
  };
}

let fetchStub: sinon.SinonStub;

setup(() => {
  vscode.resetAll();
  fetchStub = sinon.stub(globalThis as any, 'fetch');
});

teardown(() => {
  fetchStub.restore();
});

function mockResponse(status: number, body = ''): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

// ── getAuthHeaders() ──────────────────────────────────────────────────────────

suite('[F07-FR-08] SchemaAuthManager.getAuthHeaders()', () => {
  test('[F07-FR-04] returns a Bearer header from the GitHub session for a GitHub URL', async () => {
    vscode.authentication.getSession.resolves({ accessToken: 'gh-token' } as any);
    const auth = new SchemaAuthManager(makeContext() as any);
    const headers = await auth.getAuthHeaders('https://raw.githubusercontent.com/o/r/main/s.json');
    assert.deepStrictEqual(headers, { Authorization: 'Bearer gh-token' });
  });

  test('treats a rejected GitHub session lookup as "no token" rather than throwing', async () => {
    vscode.authentication.getSession.rejects(new Error('not signed in'));
    const auth = new SchemaAuthManager(makeContext() as any);
    const headers = await auth.getAuthHeaders('https://raw.githubusercontent.com/o/r/main/s.json');
    assert.deepStrictEqual(headers, {});
  });

  test('returns {} for a GitHub URL with no session and no stored credential', async () => {
    vscode.authentication.getSession.resolves(undefined);
    const auth = new SchemaAuthManager(makeContext() as any);
    const headers = await auth.getAuthHeaders('https://raw.githubusercontent.com/o/r/main/s.json');
    assert.deepStrictEqual(headers, {});
  });

  test('[F07-FR-05] returns a Bearer header from a stored bearer credential for a non-GitHub host', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'bearer', value: 'abc123' });
    const auth = new SchemaAuthManager(ctx as any);
    const headers = await auth.getAuthHeaders('https://example.com/schema.json');
    assert.deepStrictEqual(headers, { Authorization: 'Bearer abc123' });
  });

  test('[F07-FR-06] returns a Basic header from a stored basic credential', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'basic', value: 'dXNlcjpwYXNz' });
    const auth = new SchemaAuthManager(ctx as any);
    const headers = await auth.getAuthHeaders('https://example.com/schema.json');
    assert.deepStrictEqual(headers, { Authorization: 'Basic dXNlcjpwYXNz' });
  });

  test('[F07-FR-14] warns once per host when credentials go out over plain http, still attaching them', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'bearer', value: 'abc123' });
    const auth = new SchemaAuthManager(ctx as any);
    const headers = await auth.getAuthHeaders('http://example.com/schema.json');
    assert.deepStrictEqual(headers, { Authorization: 'Bearer abc123' }, 'the request must still proceed with auth');
    await auth.getAuthHeaders('http://example.com/other.json');
    assert.strictEqual(vscode.window.showWarningMessage.callCount, 1, 'one warning per host per session');
    // Anchored so this doesn't read as a host-substring URL check (CodeQL
    // js/missing-regexp-anchor): assert the exact message shape instead.
    assert.match(
      vscode.window.showWarningMessage.firstCall.args[0],
      /^Credentials for example\.com are being sent over plain http/,
    );
  });

  test('[F07-FR-14] no insecure-transport warning for https or credential-less http fetches', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:secure.example'] = JSON.stringify({ type: 'bearer', value: 'abc123' });
    const auth = new SchemaAuthManager(ctx as any);
    await auth.getAuthHeaders('https://secure.example/schema.json');
    await auth.getAuthHeaders('http://open.example/schema.json'); // no stored credential
    assert.strictEqual(vscode.window.showWarningMessage.callCount, 0);
  });

  test('[F07-FR-07][S05-SR-03] one credential keyed by host covers every path under that host, and no other host', async () => {
    const ctx = makeContext();
    // A single credential, stored once under the host key…
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'bearer', value: 'tok' });
    const auth = new SchemaAuthManager(ctx as any);
    // …applies to two different paths under the same host…
    assert.deepStrictEqual(await auth.getAuthHeaders('https://example.com/a/one.json'), { Authorization: 'Bearer tok' });
    assert.deepStrictEqual(await auth.getAuthHeaders('https://example.com/b/two.json'), { Authorization: 'Bearer tok' });
    // …but not to a different host.
    assert.deepStrictEqual(await auth.getAuthHeaders('https://other.com/one.json'), {});
  });

  test('returns {} when no credential is stored for the host', async () => {
    const auth = new SchemaAuthManager(makeContext() as any);
    const headers = await auth.getAuthHeaders('https://example.com/schema.json');
    assert.deepStrictEqual(headers, {});
  });

  test('treats a SecretStorage rejection as "no credential" rather than throwing', async () => {
    const auth = new SchemaAuthManager(makeContext({ rejectGet: true }) as any);
    const headers = await auth.getAuthHeaders('https://example.com/schema.json');
    assert.deepStrictEqual(headers, {});
  });

  test('treats malformed stored JSON as "no credential"', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = 'not json';
    const auth = new SchemaAuthManager(ctx as any);
    const headers = await auth.getAuthHeaders('https://example.com/schema.json');
    assert.deepStrictEqual(headers, {});
  });
});

// ── fetchText() ───────────────────────────────────────────────────────────────

suite('[S03-SR-03][S03-SR-12] SchemaAuthManager.fetchText()', () => {
  test('returns the response body on success', async () => {
    fetchStub.resolves(mockResponse(200, '{"ok":true}'));
    const auth = new SchemaAuthManager(makeContext() as any);
    const text = await auth.fetchText('https://example.com/s.json');
    assert.strictEqual(text, '{"ok":true}');
  });

  test('[F07-FR-09] throws AuthRequiredError on 401', async () => {
    fetchStub.resolves(mockResponse(401));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://example.com/s.json'),
      (e: any) => e instanceof AuthRequiredError && e.status === 401,
    );
  });

  test('[F07-FR-09] throws AuthRequiredError on 403', async () => {
    fetchStub.resolves(mockResponse(403));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://example.com/s.json'),
      (e: any) => e instanceof AuthRequiredError && e.status === 403,
    );
  });

  test('[S04-SR-04] throws HttpError carrying the status for a non-auth error response', async () => {
    fetchStub.resolves(mockResponse(500));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://example.com/s.json'),
      (e: any) => e.name === 'HttpError' && e.status === 500,
    );
  });

  test('[F07-FR-15] an unauthenticated 404 on a GitHub host is AuthRequiredError, not a plain 404', async () => {
    vscode.authentication.getSession.resolves(undefined);
    fetchStub.resolves(mockResponse(404));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://raw.githubusercontent.com/o/private-repo/main/s.json'),
      (e: any) => e instanceof AuthRequiredError && e.status === 404,
    );
  });

  test('[F07-FR-15] an authenticated 404 on a GitHub host stays a plain not-found', async () => {
    vscode.authentication.getSession.resolves({ accessToken: 'gh-token' } as any);
    fetchStub.resolves(mockResponse(404));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://raw.githubusercontent.com/o/private-repo/main/s.json'),
      (e: any) => e.name === 'HttpError' && e.status === 404,
    );
  });

  test('[F07-FR-15] a 404 on a non-GitHub host stays a plain not-found even without credentials', async () => {
    fetchStub.resolves(mockResponse(404));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://example.com/s.json'),
      (e: any) => e.name === 'HttpError' && e.status === 404,
    );
  });

  test('[S03-SR-14][F08-FR-13] throws a "Timed out" error when the request is aborted', async () => {
    fetchStub.callsFake((_url: string, opts: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://example.com/s.json', 10),
      /Timed out fetching .* after 10 ms/,
    );
  });

  test('propagates a non-abort network failure unchanged', async () => {
    fetchStub.rejects(new Error('getaddrinfo ENOTFOUND example.com'));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchText('https://example.com/s.json'),
      /ENOTFOUND/,
    );
  });

  test('sends the resolved auth header on the request', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'bearer', value: 'tok' });
    fetchStub.resolves(mockResponse(200, 'body'));
    const auth = new SchemaAuthManager(ctx as any);
    await auth.fetchText('https://example.com/s.json');
    const [, opts] = fetchStub.firstCall.args;
    assert.strictEqual(opts.headers.Authorization, 'Bearer tok');
  });
});

// ── fetchConditional() ────────────────────────────────────────────────────────

function conditionalResponse(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): Response {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) { lower[k.toLowerCase()] = v; }
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body),
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

suite('[F08-FR-15][F08-FR-16] SchemaAuthManager.fetchConditional()', () => {
  test('returns the body plus ETag / Last-Modified on a 200', async () => {
    fetchStub.resolves(conditionalResponse(200, '{"v":1}', {
      ETag: 'W/"abc"',
      'Last-Modified': 'Wed, 21 Oct 2026 07:28:00 GMT',
    }));
    const auth = new SchemaAuthManager(makeContext() as any);
    const res = await auth.fetchConditional('https://example.com/s.json');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, '{"v":1}');
    assert.strictEqual(res.etag, 'W/"abc"');
    assert.strictEqual(res.lastModified, 'Wed, 21 Oct 2026 07:28:00 GMT');
  });

  test('[F08-FR-15] sends If-None-Match / If-Modified-Since when validators are supplied', async () => {
    fetchStub.resolves(conditionalResponse(304));
    const auth = new SchemaAuthManager(makeContext() as any);
    await auth.fetchConditional('https://example.com/s.json', 30_000, {
      etag: 'W/"abc"',
      lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT',
    });
    const [, opts] = fetchStub.firstCall.args;
    assert.strictEqual(opts.headers['If-None-Match'], 'W/"abc"');
    assert.strictEqual(opts.headers['If-Modified-Since'], 'Wed, 21 Oct 2026 07:28:00 GMT');
  });

  test('[F08-FR-15] a 304 returns no body and echoes the sent validators', async () => {
    fetchStub.resolves(conditionalResponse(304));
    const auth = new SchemaAuthManager(makeContext() as any);
    const res = await auth.fetchConditional('https://example.com/s.json', 30_000, { etag: '"e1"' });
    assert.strictEqual(res.status, 304);
    assert.strictEqual(res.text, undefined);
    assert.strictEqual(res.etag, '"e1"');
  });

  test('throws AuthRequiredError on 401', async () => {
    fetchStub.resolves(conditionalResponse(401));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchConditional('https://example.com/s.json'),
      (e: any) => e instanceof AuthRequiredError && e.status === 401,
    );
  });

  test('throws HttpError on a non-ok, non-auth status', async () => {
    fetchStub.resolves(conditionalResponse(500));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchConditional('https://example.com/s.json'),
      (e: any) => e.name === 'HttpError' && e.status === 500,
    );
  });

  test('[F07-FR-15] an unauthenticated 404 on a GitHub host is AuthRequiredError', async () => {
    vscode.authentication.getSession.resolves(undefined);
    fetchStub.resolves(conditionalResponse(404));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchConditional('https://raw.githubusercontent.com/o/private-repo/main/s.json'),
      (e: any) => e instanceof AuthRequiredError && e.status === 404,
    );
  });

  test('maps an aborted request to a "Timed out" error', async () => {
    fetchStub.callsFake((_url: string, opts: { signal: AbortSignal }) => new Promise((_r, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted'); err.name = 'AbortError'; reject(err);
      });
    }));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchConditional('https://example.com/s.json', 10),
      /Timed out fetching .* after 10 ms/,
    );
  });

  test('propagates a non-abort network failure unchanged', async () => {
    fetchStub.rejects(new Error('getaddrinfo ENOTFOUND example.com'));
    const auth = new SchemaAuthManager(makeContext() as any);
    await assert.rejects(
      () => auth.fetchConditional('https://example.com/s.json'),
      /ENOTFOUND/,
    );
  });
});

// ── isConfigured() ────────────────────────────────────────────────────────────

suite('SchemaAuthManager.isConfigured()', () => {
  test('true for a GitHub URL with an active session', async () => {
    vscode.authentication.getSession.resolves({ accessToken: 'x' } as any);
    const auth = new SchemaAuthManager(makeContext() as any);
    assert.strictEqual(await auth.isConfigured('https://raw.githubusercontent.com/o/r/s.json'), true);
  });

  test('false for a GitHub URL with no session', async () => {
    const auth = new SchemaAuthManager(makeContext() as any);
    assert.strictEqual(await auth.isConfigured('https://raw.githubusercontent.com/o/r/s.json'), false);
  });

  test('true for a non-GitHub host with a stored credential', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'bearer', value: 'x' });
    const auth = new SchemaAuthManager(ctx as any);
    assert.strictEqual(await auth.isConfigured('https://example.com/s.json'), true);
  });

  test('false for a non-GitHub host with no stored credential', async () => {
    const auth = new SchemaAuthManager(makeContext() as any);
    assert.strictEqual(await auth.isConfigured('https://example.com/s.json'), false);
  });
});

// ── configureAuth() ────────────────────────────────────────────────────────────

suite('[F07-FR-01] SchemaAuthManager.configureAuth()', () => {
  test('returns false when the user dismisses the Quick Pick', async () => {
    vscode.window.showQuickPick.resolves(undefined);
    const auth = new SchemaAuthManager(makeContext() as any);
    assert.strictEqual(await auth.configureAuth('https://example.com/s.json'), false);
  });

  test('[F07-FR-04] GitHub flow requests a session and returns true', async () => {
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find(i => i.id === 'github'));
    vscode.authentication.getSession.resolves({ accessToken: 'tok' } as any);
    const auth = new SchemaAuthManager(makeContext() as any);
    const ok = await auth.configureAuth('https://raw.githubusercontent.com/o/r/s.json');
    assert.strictEqual(ok, true);
    assert.ok(vscode.authentication.getSession.calledWith('github', ['repo'], { createIfNone: true }));
    assert.ok(vscode.window.setStatusBarMessage.calledWithMatch(/GitHub authentication configured/)); // F34-FR-12
  });

  test('[F07-FR-05] Bearer flow stores the token and returns true', async () => {
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find(i => i.id === 'bearer'));
    vscode.window.showInputBox.resolves('my-token');
    const ctx = makeContext();
    const auth = new SchemaAuthManager(ctx as any);
    const ok = await auth.configureAuth('https://example.com/s.json');
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(
      JSON.parse(ctx._store['schemaauth:example.com']),
      { type: 'bearer', value: 'my-token' },
    );
  });

  test('Bearer flow returns false without storing anything when input is cancelled', async () => {
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find(i => i.id === 'bearer'));
    vscode.window.showInputBox.resolves(undefined);
    const ctx = makeContext();
    const auth = new SchemaAuthManager(ctx as any);
    const ok = await auth.configureAuth('https://example.com/s.json');
    assert.strictEqual(ok, false);
    assert.deepStrictEqual(ctx._store, {});
  });

  test('[F07-FR-06] Basic flow stores base64(username:password) and returns true', async () => {
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find(i => i.id === 'basic'));
    vscode.window.showInputBox.onFirstCall().resolves('alice').onSecondCall().resolves('secret');
    const ctx = makeContext();
    const auth = new SchemaAuthManager(ctx as any);
    const ok = await auth.configureAuth('https://example.com/s.json');
    assert.strictEqual(ok, true);
    const stored = JSON.parse(ctx._store['schemaauth:example.com']);
    assert.strictEqual(stored.type, 'basic');
    assert.strictEqual(Buffer.from(stored.value, 'base64').toString(), 'alice:secret');
  });

  test('Basic flow returns false when username is cancelled (never prompts for password)', async () => {
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find(i => i.id === 'basic'));
    vscode.window.showInputBox.resolves(undefined);
    const auth = new SchemaAuthManager(makeContext() as any);
    const ok = await auth.configureAuth('https://example.com/s.json');
    assert.strictEqual(ok, false);
    assert.strictEqual(vscode.window.showInputBox.callCount, 1);
  });

  test('Basic flow returns false without storing when password is cancelled', async () => {
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find(i => i.id === 'basic'));
    vscode.window.showInputBox.onFirstCall().resolves('alice').onSecondCall().resolves(undefined);
    const ctx = makeContext();
    const auth = new SchemaAuthManager(ctx as any);
    const ok = await auth.configureAuth('https://example.com/s.json');
    assert.strictEqual(ok, false);
    assert.deepStrictEqual(ctx._store, {});
  });

  test('the Quick Pick offers "Remove credentials" only when already configured', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'bearer', value: 'x' });
    let seenItems: any[] = [];
    vscode.window.showQuickPick.callsFake(async (items: any[]) => { seenItems = items; return undefined; });
    const auth = new SchemaAuthManager(ctx as any);
    await auth.configureAuth('https://example.com/s.json');
    assert.ok(seenItems.some(i => i.id === 'remove'));
  });

  test('the Quick Pick omits "Remove credentials" when not configured', async () => {
    let seenItems: any[] = [];
    vscode.window.showQuickPick.callsFake(async (items: any[]) => { seenItems = items; return undefined; });
    const auth = new SchemaAuthManager(makeContext() as any);
    await auth.configureAuth('https://example.com/s.json');
    assert.ok(!seenItems.some(i => i.id === 'remove'));
  });

  test('Remove flow deletes the credential and returns true', async () => {
    const ctx = makeContext();
    ctx._store['schemaauth:example.com'] = JSON.stringify({ type: 'bearer', value: 'x' });
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find(i => i.id === 'remove'));
    const auth = new SchemaAuthManager(ctx as any);
    const ok = await auth.configureAuth('https://example.com/s.json');
    assert.strictEqual(ok, true);
    assert.strictEqual(ctx._store['schemaauth:example.com'], undefined);
  });

  test('the Quick Pick offers a GitHub option only for GitHub URLs', async () => {
    let seenItems: any[] = [];
    vscode.window.showQuickPick.callsFake(async (items: any[]) => { seenItems = items; return undefined; });
    const auth = new SchemaAuthManager(makeContext() as any);
    await auth.configureAuth('https://example.com/s.json');
    assert.ok(!seenItems.some(i => i.id === 'github'));
  });
});
