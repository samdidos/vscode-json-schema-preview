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

  test('[S03-SR-14] throws a "Timed out" error when the request is aborted', async () => {
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
    assert.ok(vscode.window.showInformationMessage.called);
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
