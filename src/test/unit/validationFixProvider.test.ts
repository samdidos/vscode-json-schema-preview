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

suite('[F25-FR-03] ValidationFixProvider — preferred enum near-miss', () => {
  const text = '{ "env": "prod" }';

  test('marks the closest enum fix as the editor default (isPreferred)', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(
      doc.uri,
      buildFixes(
        [{ keyword: 'enum', instancePath: '/env', params: { allowedValues: ['development', 'staging', 'production'] } }],
        {},
        { env: 'prod' },
      ),
    );
    const actions = provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/env')]));
    const preferred = actions.filter(a => a.isPreferred);
    assert.strictEqual(preferred.length, 1, 'exactly one preferred fix');
    assert.match(preferred[0].title, /production.*closest match/);
  });
});

suite('[F25-FR-05] ValidationFixProvider — preferred property rename', () => {
  test('offers the rename ahead of the removal, as the editor default', () => {
    const text = '{ "descripton": "x" }';
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    const schema = { type: 'object', additionalProperties: false, properties: { description: { type: 'string' } } };
    provider.record(doc.uri, buildFixes(
      [{ keyword: 'additionalProperties', instancePath: '', params: { additionalProperty: 'descripton' } }],
      schema,
      { descripton: 'x' },
    ));
    const actions = provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/')]));
    assert.deepStrictEqual(actions.map(a => a.title), [
      'Rename to "description" (closest match)',
      'Remove unexpected property "descripton"',
    ]);
    assert.deepStrictEqual(actions.map(a => a.isPreferred === true), [true, false]);
    assert.strictEqual((actions[0].edit as any).edits[0].newText, '"description"');
  });
});

suite('[F21-FR-10][F21-FR-11][F21-FR-12] ValidationFixProvider — edits in the document\'s own format', () => {
  const typeFix = (record?: number) => {
    const [fix] = buildFixes([{ keyword: 'type', instancePath: '/age', params: { type: 'integer' } }], {}, { age: '5' });
    return record === undefined ? fix : { ...fix, record };
  };
  const docIn = (languageId: string, text: string) => ({ ...makeDoc(text, `/ws/data.${languageId}`), languageId });

  test('a YAML document is edited as YAML', () => {
    const text = 'age: "5" # years';
    const provider = new ValidationFixProvider();
    const doc = docIn('yaml', text);
    provider.record(doc.uri, [typeFix()]);
    const [action] = provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/age')]));
    const [edit] = (action.edit as any).edits;
    assert.strictEqual(edit.newText, '5');
    assert.deepStrictEqual([edit.range.start.character, edit.range.end.character], [5, 8]);
  });

  test('a TOML document is edited as TOML', () => {
    const text = 'age = "5" # years';
    const provider = new ValidationFixProvider();
    const doc = docIn('toml', text);
    provider.record(doc.uri, [typeFix()]);
    const [action] = provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/age')]));
    const [edit] = (action.edit as any).edits;
    assert.strictEqual(edit.newText, '5');
    assert.deepStrictEqual([edit.range.start.character, edit.range.end.character], [6, 9]);
  });

  test('a JSONL fix is offered only on its own record\'s diagnostic', () => {
    const text = '{"age":"5"} {"age":"5"}'.replace(' ', '\n');
    const provider = new ValidationFixProvider();
    const doc = docIn('jsonl', text);
    provider.record(doc.uri, [typeFix(1)]);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('#1/age')])), []);
    assert.deepStrictEqual(provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/age')])), []);
    const [action] = provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('#2/age')]));
    const [edit] = (action.edit as any).edits;
    assert.strictEqual(edit.newText, '5');
    // In the second record, 12 characters in.
    assert.deepStrictEqual([edit.range.start.character, edit.range.end.character], [19, 22]);
  });
});

suite('[F21-FR-13] ValidationFixProvider — fix all', () => {
  const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' }, age: { type: 'integer' } } };
  const errors = [
    { keyword: 'required', instancePath: '', params: { missingProperty: 'name' } },
    { keyword: 'type', instancePath: '/age', params: { type: 'integer' } },
    { keyword: 'additionalProperties', instancePath: '', params: { additionalProperty: 'extra' } },
  ];
  const text = '{"age":"5","extra":1}';

  test('is offered from any validation diagnostic once more than one fix needs no decision', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, buildFixes(errors, schema, { age: '5', extra: 1 }));
    const diag = validationDiag('/age');
    const actions = provider.provideCodeActions(doc, wholeRange(text), ctx([diag]));
    assert.deepStrictEqual(actions.map(a => a.title), ['Change to 5', 'Fix all 2 auto-fixable validation problems']);
    const all = actions[1];
    assert.strictEqual(all.isPreferred, undefined);
    assert.strictEqual((all.diagnostics as any[])[0], diag);
    const [edit] = (all.edit as any).edits;
    const fixed = text.slice(0, edit.range.start.character) + edit.newText + text.slice(edit.range.end.character);
    // Both auto-fixes applied; the unexpected property is left for the user.
    assert.deepStrictEqual(JSON.parse(fixed), { age: 5, extra: 1, name: '' });
  });

  test('is not offered for a single auto-fixable problem, or when only removals remain', () => {
    const provider = new ValidationFixProvider();
    const doc = makeDoc(text);
    provider.record(doc.uri, buildFixes(errors.slice(1), schema, { age: '5', extra: 1 }));
    const titles = provider.provideCodeActions(doc, wholeRange(text), ctx([validationDiag('/age'), validationDiag('/')]))
      .map(a => a.title);
    assert.deepStrictEqual(titles, ['Change to 5', 'Remove unexpected property "extra"']);
  });

  test('counts only the fixes that still apply to the current text', () => {
    const provider = new ValidationFixProvider();
    const stale = '{"extra":1}'; // `age` was deleted after validation
    const doc = makeDoc(stale);
    provider.record(doc.uri, buildFixes(errors, schema, { age: '5', extra: 1 }));
    const titles = provider.provideCodeActions(doc, wholeRange(stale), ctx([validationDiag('/')])).map(a => a.title);
    assert.deepStrictEqual(titles, ['Add missing required property "name"', 'Remove unexpected property "extra"']);
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
