import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { ValidationFixProvider } from '../../ValidationFixProvider';
import { buildFixes } from '../../validationFix';

/** Document double using a linear offset model (offset === character), so a
 *  Range built from Position(0, off) round-trips through offsetAt/positionAt. */
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

const validationDiag = (message = '/kind: error') => {
  const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message);
  d.source = 'JSON Schema';
  return d;
};

setup(() => vscode.resetAll());

suite('[F21-FR-07] ValidationFixProvider — surfaces recorded fixes', () => {
  const text = '{ "kind": "other" }';
  const fixes = () => buildFixes([{ keyword: 'const', instancePath: '/kind', params: { allowedValue: 'fixed' } }], {}, { kind: 'other' });

  test('offers a QuickFix action carrying the workspace edit and diagnostics', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, fixes());
    const diag = validationDiag();
    const actions = provider.provideCodeActions(doc, wholeRange(text), ctx([diag]));
    assert.strictEqual(actions.length, 1);
    assert.match(actions[0].title, /Change to "fixed"/);
    assert.strictEqual((actions[0].edit as any).edits[0].newText, '"fixed"');
    assert.strictEqual((actions[0].diagnostics as any[])[0], diag);
  });

  test('[F21-FR-07] does nothing without a "JSON Schema" diagnostic in context', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, fixes());
    const other = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), 'x'); // no/foreign source
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([other])), []);
  });

  test('returns nothing when no fixes are recorded for the document', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag()])), []);
  });
});

suite('[F21-FR-08] ValidationFixProvider — range gating', () => {
  const text = '{ "kind": "other" }'; // value "other" spans offsets 10..17

  test('excludes a fix whose edit span does not overlap the request range', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, buildFixes([{ keyword: 'const', instancePath: '/kind', params: { allowedValue: 'fixed' } }], {}, { kind: 'other' }));
    const early: any = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 3));
    assert.deepStrictEqual(provider.provideCodeActions(doc, early, ctx([validationDiag()])), []);
  });
});

suite('[F21-FR-09] ValidationFixProvider — lifecycle', () => {
  const text = '{ "kind": "other" }';
  const someFixes = () => buildFixes([{ keyword: 'const', instancePath: '/kind', params: { allowedValue: 'fixed' } }], {}, { kind: 'other' });

  test('record([]) clears previously recorded fixes', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, someFixes());
    provider.record(doc.uri, []);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag()])), []);
  });

  test('clear() forgets the recorded fixes for a document', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, someFixes());
    provider.clear(doc.uri);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag()])), []);
  });

  test('[F21-FR-06] a fix whose target node is gone produces no action', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc('{ "other": 1 }'); // no "kind" key anymore
    provider.record(doc.uri, someFixes());
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange('{ "other": 1 }'), ctx([validationDiag()])), []);
  });
});
