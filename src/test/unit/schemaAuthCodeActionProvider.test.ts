import * as assert from 'assert';
import * as vscode from '../mocks/vscode';

const {
  SchemaAuthCodeActionProvider,
  extractSchemaUrlFromLine,
} = require('../../SchemaAuthCodeActionProvider');

function makeDoc(lines: string[]) {
  return { lineAt: (i: number) => ({ text: lines[i] ?? '' }), uri: { fsPath: '/ws/data.json' } };
}

function makeRange(line: number) {
  return { start: { line } };
}

function makeContext(diagMessages: string[] = []) {
  return { diagnostics: diagMessages.map(message => new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), message)) };
}

setup(() => vscode.resetAll());

// ── extractSchemaUrlFromLine() ────────────────────────────────────────────────

suite('extractSchemaUrlFromLine()', () => {
  test('extracts from a JSON "$schema" property', () => {
    const doc = makeDoc(['{"$schema": "https://example.com/s.json"}']);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), 'https://example.com/s.json');
  });

  test('extracts from a yaml-language-server directive comment', () => {
    const doc = makeDoc(['# yaml-language-server: $schema=https://example.com/s.json']);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), 'https://example.com/s.json');
  });

  test('extracts from a YAML inline $schema key', () => {
    const doc = makeDoc(['$schema: https://example.com/s.json']);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), 'https://example.com/s.json');
  });

  test('returns undefined for a non-schema line', () => {
    const doc = makeDoc(['"title": "not a schema line"']);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), undefined);
  });

  test('returns undefined for a local file path in $schema', () => {
    const doc = makeDoc(['$schema: ./local.json']);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), undefined);
  });
});

// ── provideCodeActions() ──────────────────────────────────────────────────────

suite('[F07-FR-11] SchemaAuthCodeActionProvider.provideCodeActions()', () => {
  test('returns no actions when the line has no schema URL', () => {
    const provider = new SchemaAuthCodeActionProvider({}, { isCached: () => false });
    const doc = makeDoc(['plain text']);
    const actions = provider.provideCodeActions(doc, makeRange(0), makeContext());
    assert.deepStrictEqual(actions, []);
  });

  test('returns no actions for a local (non-remote) schema path', () => {
    const provider = new SchemaAuthCodeActionProvider({}, { isCached: () => false });
    const doc = makeDoc(['$schema: ./local.json']);
    const actions = provider.provideCodeActions(doc, makeRange(0), makeContext());
    assert.deepStrictEqual(actions, []);
  });

  test('offers "Configure authentication" and "Cache schema locally" when not cached', () => {
    const provider = new SchemaAuthCodeActionProvider({}, { isCached: () => false });
    const doc = makeDoc(['$schema: https://example.com/s.json']);
    const actions = provider.provideCodeActions(doc, makeRange(0), makeContext());
    assert.strictEqual(actions.length, 2);
    assert.match(actions[0].title, /Configure authentication for example\.com/);
    assert.strictEqual(actions[0].command.command, 'jsonschema.configureSchemaAuth');
    assert.deepStrictEqual(actions[0].command.arguments, ['https://example.com/s.json']);
    assert.match(actions[1].title, /Cache schema locally/);
    assert.strictEqual(actions[1].command.command, 'jsonschema.cacheSchemaLocally');
    assert.deepStrictEqual(actions[1].command.arguments, ['https://example.com/s.json', doc.uri]);
  });

  test('[F08-FR-08] offers "Refresh cached schema" instead when already cached', () => {
    const provider = new SchemaAuthCodeActionProvider({}, { isCached: () => true });
    const doc = makeDoc(['$schema: https://example.com/s.json']);
    const actions = provider.provideCodeActions(doc, makeRange(0), makeContext());
    assert.strictEqual(actions.length, 2);
    assert.match(actions[1].title, /Refresh cached schema from example\.com/);
    assert.strictEqual(actions[1].command.command, 'jsonschema.refreshSchemaCache');
    assert.deepStrictEqual(actions[1].command.arguments, ['https://example.com/s.json']);
  });

  test('associates schema-load diagnostics with both actions and marks the primary preferred', () => {
    const provider = new SchemaAuthCodeActionProvider({}, { isCached: () => false });
    const doc = makeDoc(['$schema: https://example.com/s.json']);
    const ctx = makeContext(['Unable to load schema from https://example.com/s.json']);
    const actions = provider.provideCodeActions(doc, makeRange(0), ctx);
    assert.deepStrictEqual(actions[0].diagnostics, ctx.diagnostics);
    assert.strictEqual(actions[0].isPreferred, true);
    // Both actions share the same filtered schema-load-diagnostics array.
    assert.strictEqual(actions[0].diagnostics, actions[1].diagnostics);
  });

  test('associates schema-load diagnostics with the refresh action when cached', () => {
    const provider = new SchemaAuthCodeActionProvider({}, { isCached: () => true });
    const doc = makeDoc(['$schema: https://example.com/s.json']);
    const ctx = makeContext(['Unable to load schema from https://example.com/s.json']);
    const actions = provider.provideCodeActions(doc, makeRange(0), ctx);
    assert.deepStrictEqual(actions[1].diagnostics, ctx.diagnostics);
  });

  test('does not attach diagnostics unrelated to a schema-load failure', () => {
    const provider = new SchemaAuthCodeActionProvider({}, { isCached: () => false });
    const doc = makeDoc(['$schema: https://example.com/s.json']);
    const ctx = makeContext(['some unrelated lint warning']);
    const actions = provider.provideCodeActions(doc, makeRange(0), ctx);
    assert.strictEqual(actions[0].diagnostics, undefined);
    assert.strictEqual(actions[0].isPreferred, undefined);
  });

  test('providedCodeActionKinds exposes QuickFix', () => {
    assert.deepStrictEqual(
      SchemaAuthCodeActionProvider.providedCodeActionKinds,
      [vscode.CodeActionKind.QuickFix],
    );
  });
});
