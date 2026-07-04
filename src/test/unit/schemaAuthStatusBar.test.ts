import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { statusBarItem, setConfig } from '../mocks/vscode';

const { SchemaAuthStatusBar } = require('../../SchemaAuthStatusBar');

function makeContext() {
  return { subscriptions: [] as any[] };
}

function makeDoc(schemaUrl?: string, languageId = 'json') {
  const text = schemaUrl
    ? JSON.stringify({ $schema: schemaUrl, type: 'object' })
    : JSON.stringify({ type: 'object' });
  return { languageId, getText: () => text, uri: { fsPath: '/ws/data.json' } };
}

/** Flush the single microtask `update()` awaits before mutating status-bar state. */
async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

setup(() => vscode.resetAll());

suite('[F07-FR-10] SchemaAuthStatusBar construction', () => {
  test('creates a right-aligned status bar item at priority 1 and tracks it', () => {
    const ctx = makeContext();
    new SchemaAuthStatusBar({ isConfigured: async () => false }, ctx);
    assert.ok(vscode.window.createStatusBarItem.calledWith(vscode.StatusBarAlignment.Right, 1));
    assert.ok(ctx.subscriptions.includes(statusBarItem));
  });

  test('registers onDidChangeActiveTextEditor and onDidChangeSessions listeners', () => {
    new SchemaAuthStatusBar({ isConfigured: async () => false }, makeContext());
    assert.ok(vscode.window.onDidChangeActiveTextEditor.called);
    assert.ok(vscode.authentication.onDidChangeSessions.called);
  });

  test('hides on construction when there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;
    new SchemaAuthStatusBar({ isConfigured: async () => false }, makeContext());
    await tick();
    assert.ok(statusBarItem.hide.called);
  });
});

suite('[F07-FR-10] SchemaAuthStatusBar — schema resolution', () => {
  test('hides when the active document has no schema at all', async () => {
    vscode.window.activeTextEditor = { document: makeDoc(undefined) };
    new SchemaAuthStatusBar({ isConfigured: async () => false }, makeContext());
    await tick();
    assert.ok(statusBarItem.hide.called);
  });

  test('hides when the schema is a local path (not remote)', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('./local.schema.json') };
    new SchemaAuthStatusBar({ isConfigured: async () => false }, makeContext());
    await tick();
    assert.ok(statusBarItem.hide.called);
  });

  test('shows $(unlock) with a warning background when the remote schema is not configured', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('https://example.com/s.json') };
    new SchemaAuthStatusBar({ isConfigured: async () => false }, makeContext());
    await tick();
    assert.strictEqual(statusBarItem.text, '$(unlock) example.com');
    assert.ok(statusBarItem.backgroundColor instanceof vscode.ThemeColor);
    assert.strictEqual((statusBarItem.backgroundColor as any).id, 'statusBarItem.warningBackground');
    const command = statusBarItem.command as { command: string; arguments?: unknown[] };
    assert.strictEqual(command.command, 'jsonschema.configureSchemaAuth');
    assert.deepStrictEqual(command.arguments, ['https://example.com/s.json']);
    assert.ok(statusBarItem.show.called);
  });

  test('an external binding takes precedence over an inline $schema', async () => {
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    setConfig('json', 'schemas', [{ url: 'https://bound.example.com/s.json', fileMatch: ['data.json'] }]);
    vscode.window.activeTextEditor = { document: makeDoc('https://inline.example.com/s.json') };
    new SchemaAuthStatusBar({ isConfigured: async () => false }, makeContext());
    await tick();
    assert.strictEqual(statusBarItem.text, '$(unlock) bound.example.com');
  });

  test('shows $(lock) with no background override when the remote schema is configured', async () => {
    vscode.window.activeTextEditor = { document: makeDoc('https://example.com/s.json') };
    new SchemaAuthStatusBar({ isConfigured: async () => true }, makeContext());
    await tick();
    assert.strictEqual(statusBarItem.text, '$(lock) example.com');
    assert.strictEqual(statusBarItem.backgroundColor, undefined);
    assert.ok(statusBarItem.show.called);
  });
});

suite('[F07-FR-10] SchemaAuthStatusBar — refresh on events', () => {
  test('re-evaluates when the active editor changes', async () => {
    vscode.window.activeTextEditor = undefined;
    new SchemaAuthStatusBar({ isConfigured: async () => false }, makeContext());
    await tick();
    assert.ok(statusBarItem.hide.called);

    const cb = vscode.window.onDidChangeActiveTextEditor.firstCall.args[0];
    cb({ document: makeDoc('https://example.com/s.json') });
    await tick();
    assert.strictEqual(statusBarItem.text, '$(unlock) example.com');
  });

  test('re-evaluates the current document when the GitHub session changes', async () => {
    let configured = false;
    vscode.window.activeTextEditor = { document: makeDoc('https://example.com/s.json') };
    new SchemaAuthStatusBar({ isConfigured: async () => configured }, makeContext());
    await tick();
    assert.strictEqual(statusBarItem.text, '$(unlock) example.com');

    configured = true; // simulate the user having just signed in
    const sessionCb = vscode.authentication.onDidChangeSessions.firstCall.args[0];
    sessionCb();
    await tick();
    assert.strictEqual(statusBarItem.text, '$(lock) example.com');
  });
});
