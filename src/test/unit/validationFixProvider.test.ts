import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { ValidationFixProvider } from '../../ValidationFixProvider';
import { buildFixes } from '../../validationFix';

/** Document double using a linear offset model (offset === character). */
function makeDoc(text: string, fsPath = '/ws/data.json') {
  return {
    languageId: 'json',
    uri: { fsPath, toString: () => `file://${fsPath}` } as any,
    getText: () => text,
    offsetAt: (pos: any) => pos.character,
    positionAt: (off: number) => new vscode.Position(0, off),
  } as any;
}

function wholeRange(text: string): any {
  return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, text.length));
}

function ctx(diagnostics: any[]) {
  return { diagnostics } as any;
}

/** A validation diagnostic carrying an instance path on `code` (F21-FR-08). */
const validationDiag = (code = '/kind', message = `${code}: error`) => {
  const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message);
  d.source = 'JSON Schema';
  d.code = code;
  return d;
};

const constFix = () =>
  buildFixes([{ keyword: 'const', instancePath: '/kind', params: { allowedValue: 'fixed' } }], {}, { kind: 'other' });

setup(() => vscode.resetAll());

suite('[F21-FR-07] ValidationFixProvider — surfaces recorded fixes', () => {
  const text = '{ "kind": "other" }';

  test('offers a QuickFix action carrying the workspace edit and diagnostics', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, constFix());
    const diag = validationDiag('/kind');
    const actions = provider.provideCodeActions(doc, wholeRange(text), ctx([diag]));
    assert.strictEqual(actions.length, 1);
    assert.match(actions[0].title, /Change to "fixed"/);
    assert.strictEqual((actions[0].edit as any).edits[0].newText, '"fixed"');
    assert.strictEqual((actions[0].diagnostics as any[])[0], diag);
  });

  test('[F21-FR-07] does nothing without a "JSON Schema" diagnostic in context', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, constFix());
    const other = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), 'x'); // foreign source, no code
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([other])), []);
  });

  test('returns nothing when no fixes are recorded for the document', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag()])), []);
  });
});

suite('[F21-FR-08] ValidationFixProvider — matches fixes to diagnostics by instance path', () => {
  const text = '{ "kind": "other" }';

  test('offers a value fix even though its diagnostic sits on the key, not the value', () => {
    // The regression this guards: geometric range gating would exclude the
    // value edit because the diagnostic range covers the key. Instance-path
    // matching offers it regardless of column geometry.
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, constFix());
    const actions = provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/kind')]));
    assert.strictEqual(actions.length, 1);
  });

  test('excludes a fix whose error is not among the diagnostics at the cursor', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, constFix()); // fix targets /kind
    // A diagnostic for a different node — the /kind fix must not surface here.
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/other')])), []);
  });

  test('matches an add-required fix by the parent object path', () => {
    // required error at the root → diagnostic path "/"; the fix inserts a child,
    // so it must match on the parent (root) rather than on the child path.
    const provider = new ValidationFixProvider();
    const schema = { required: ['name'], properties: { name: { type: 'string' } } };
    const doc = makeDoc('{}');
    provider.record(doc.uri, buildFixes([{ keyword: 'required', instancePath: '', params: { missingProperty: 'name' } }], schema, {}));
    const actions = provider.provideCodeActions(doc, wholeRange('{}'), ctx([validationDiag('/')]));
    assert.strictEqual(actions.length, 1);
    assert.match(actions[0].title, /Add missing required property "name"/);
  });
});

suite('[F21-FR-09] ValidationFixProvider — lifecycle', () => {
  const text = '{ "kind": "other" }';

  test('record([]) clears previously recorded fixes', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, constFix());
    provider.record(doc.uri, []);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag()])), []);
  });

  test('clear() forgets the recorded fixes for a document', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, constFix());
    provider.clear(doc.uri);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag()])), []);
  });

  test('[F21-FR-06] a fix whose target node is gone produces no action', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc('{ "other": 1 }'); // no "kind" key anymore
    provider.record(doc.uri, constFix());
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange('{ "other": 1 }'), ctx([validationDiag('/kind')])), []);
  });
});
