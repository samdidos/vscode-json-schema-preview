import * as assert from 'assert';
import fc from 'fast-check';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import {
  applyFix, computeFixEdits, computeFixAllEdits, selectAutoFixes, buildFixes,
  diagnosticCode, fixDiagnosticCode, type ValidationFix,
} from '../../validationFix';
import { renderTomlValue, renderTomlKey } from '../../dataFixToml';
import { jsonlRecordSpans, parseJsonl } from '../../languages';
import { locateInstanceSpan, locateInstancePath, validateInstances } from '../../workspaceValidation';

type Extra = Partial<Pick<ValidationFix, 'value' | 'remove' | 'newName' | 'record' | 'preferred'>>;
const fix = (kind: ValidationFix['kind'], path: (string | number)[], extra: Extra = {}): ValidationFix =>
  ({ title: 't', kind, path, ...extra });
const add = (path: (string | number)[], value: unknown, record?: number) => fix('add-required', path, { value, record });
const remove = (path: (string | number)[], record?: number) => fix('remove-additional', path, { remove: true, record });
const set = (path: (string | number)[], value: unknown, record?: number) => fix('coerce-type', path, { value, record });
const rename = (path: (string | number)[], newName: string, record?: number) => fix('rename-property', path, { newName, record });

const yaml = (text: string, f: ValidationFix) => applyFix(text, f, undefined, 'yaml');
const toml = (text: string, f: ValidationFix) => applyFix(text, f, undefined, 'toml');
const jsonl = (text: string, f: ValidationFix) => applyFix(text, f, undefined, 'jsonl');
const none = (text: string, f: ValidationFix, languageId: string) =>
  assert.deepStrictEqual(computeFixEdits(text, f, undefined, languageId), []);
/** smol-toml returns prototype-less tables; compare them as plain data. */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

// ── YAML ─────────────────────────────────────────────────────────────────────

suite('[F21-FR-10] YAML quick fixes — one token, or only the lines involved', () => {
  const DOC = '# top\nname: x\nserver:\n    port: "80"   # aligned\n    extra: 1\nlist:\n    - a\n';

  test('a value fix rewrites the value token and keeps the trailing comment where it was', () => {
    assert.strictEqual(yaml(DOC, set(['server', 'port'], 80)), DOC.replace('"80"', '80'));
    assert.deepStrictEqual(computeFixEdits(DOC, set(['server', 'port'], 80), undefined, 'yaml'), [
      { offset: DOC.indexOf('"80"'), length: 4, content: '80' },
    ]);
  });

  test('values are written as YAML: quoted only when they would otherwise change type', () => {
    assert.strictEqual(yaml('a: 5\n', set(['a'], '5')), 'a: "5"\n');
    assert.strictEqual(yaml('a: 5\n', set(['a'], 'plain')), 'a: plain\n');
    assert.strictEqual(yaml('a: 5\n', set(['a'], 'has: colon')), 'a: "has: colon"\n');
    assert.strictEqual(yaml('a: 5\n', set(['a'], 'two\nlines')), 'a: "two\\nlines"\n');
    assert.strictEqual(yaml('a: 5\n', set(['a'], true)), 'a: true\n');
    assert.strictEqual(yaml('a: 5\n', set(['a'], null)), 'a: null\n');
    assert.strictEqual(yaml('a: 5\n', set(['a'], { k: [1, 'x'] })), 'a: {"k":[1,"x"]}\n');
    assert.strictEqual(yaml('a: 5\n', set(['a'], [])), 'a: []\n');
  });

  test('a value fix reaches into sequences, and replaces the whole document at the root', () => {
    assert.strictEqual(
      yaml('jobs:\n  - name: 1\n  - name: b\n', set(['jobs', 0, 'name'], '1')),
      'jobs:\n  - name: "1"\n  - name: b\n',
    );
    assert.strictEqual(yaml('5\n', set([], 'five')), 'five\n');
    // A block collection is replaced up to, not through, its last line break.
    assert.strictEqual(yaml('a:\n  - 0\nb: ""\n', set(['a'], false)), 'a:\n  false\nb: ""\n');
    assert.strictEqual(yaml('a:\n  k: 1\n', set(['a'], 'x')), 'a:\n  x\n');
  });

  test('an empty value (`key:`) gains the space it did not have', () => {
    assert.strictEqual(yaml('a:\nb: 1\n', set(['a'], 5)), 'a: 5\nb: 1\n');
  });

  test('a rename rewrites the key token only, quoting it when it must be', () => {
    assert.strictEqual(yaml(DOC, rename(['server', 'extra'], 'host')), DOC.replace('extra: 1', 'host: 1'));
    assert.strictEqual(yaml('nmae: x # c\n', rename(['nmae'], 'name')), 'name: x # c\n');
    assert.strictEqual(yaml('a: 1\n', rename(['a'], 'true')), '"true": 1\n');
    none('a: 1\nb: 2\n', rename(['a'], 'b'), 'yaml');
    none('a: 1\n', rename(['missing'], 'b'), 'yaml');
    none('a: 1\n', fix('rename-property', ['a']), 'yaml');
    none('- a\n', rename([0], 'b'), 'yaml');
  });

  test('adding a property inserts one line at the mapping\'s own indentation and touches no other', () => {
    assert.strictEqual(
      yaml(DOC, add(['server', 'host'], '')),
      '# top\nname: x\nserver:\n    port: "80"   # aligned\n    extra: 1\n    host: ""\nlist:\n    - a\n',
    );
    assert.deepStrictEqual(computeFixEdits(DOC, add(['server', 'host'], ''), undefined, 'yaml'), [
      { offset: DOC.indexOf('list:'), length: 0, content: '    host: ""\n' },
    ]);
    assert.strictEqual(yaml(DOC, add(['tags'], [])), DOC + 'tags: []\n');
  });

  test('a nested placeholder is written as a block in the document\'s indentation style', () => {
    assert.strictEqual(
      yaml('a:\n  b: 1\nlist:\n- x\n', add(['a', 'c'], { k: [1] })),
      'a:\n  b: 1\n  c:\n    k:\n    - 1\nlist:\n- x\n',
    );
  });

  test('removing a property deletes its lines, and an emptied mapping becomes `{}`', () => {
    assert.strictEqual(yaml(DOC, remove(['server', 'extra'])), DOC.replace('    extra: 1\n', ''));
    assert.strictEqual(yaml('a:\n  only: 1\nb: 2\n', remove(['a', 'only'])), 'a: {}\nb: 2\n');
    assert.strictEqual(yaml('a: 1\nb:\n  c: 1\n  d:\n    - 2\n', remove(['b'])), 'a: 1\n');
    assert.strictEqual(yaml('a: { b: 1, c: 2 }\n', remove(['a', 'c'])), 'a: { b: 1 }\n');
  });

  test('line endings and a missing final line break are preserved', () => {
    assert.strictEqual(yaml('a: 1', add(['b'], 2)), 'a: 1\nb: 2');
    assert.strictEqual(yaml('a: 1\nb: 2', remove(['b'])), 'a: 1');
    assert.strictEqual(yaml('a: 1\nb: 2', remove(['a'])), 'b: 2');
    assert.strictEqual(yaml('a: 1\nb: 2', add(['a2'], 3)), 'a: 1\nb: 2\na2: 3');
    assert.strictEqual(yaml('a: 1\r\nb:\r\n  c: 1\r\n', add(['b', 'd'], 'x')), 'a: 1\r\nb:\r\n  c: 1\r\n  d: x\r\n');
    assert.strictEqual(yaml('a: 1\r\nb: 2', remove(['b'])), 'a: 1');
    assert.strictEqual(yaml('only: 1', remove(['only'])), '{}');
  });

  test('no structural fix when the layout cannot be reproduced line for line', () => {
    // A folded scalar is re-flowed by the serialiser: the lines no longer correspond.
    none('a: >\n  folded\n  text\nb: 1\n', remove(['b']), 'yaml');
    // Three-space indentation is not one the serialiser is asked to print.
    none('a:\n   b: 1\n', add(['a', 'c'], 1), 'yaml');
    // …but a token edit in the same documents is still safe.
    assert.strictEqual(yaml('a:\n   b: 1\n', set(['a', 'b'], '1')), 'a:\n   b: "1"\n');
  });

  test('no fix on a broken document, a missing target, or a parent that is not a mapping', () => {
    none('a: [1, 2\n', set(['a'], 1), 'yaml');
    none('a: 1\n', set(['b'], 1), 'yaml');
    none('a: 1\n', add(['a', 'b'], 1), 'yaml');
    none('a: 1\n', add(['a'], 2), 'yaml');
    none('a: 1\n', remove(['b']), 'yaml');
    none('- 1\n', add(['x'], 1), 'yaml');
    none('', add(['x'], 1), 'yaml');
  });

  test('[F21-FR-14] every edit offered on a printed document yields exactly the intended data', () => {
    const scalar = fc.oneof(fc.integer(), fc.boolean(), fc.string({ maxLength: 8 }), fc.constant(null));
    const key = fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/);
    const tree = fc.dictionary(key, fc.oneof(scalar, fc.array(scalar, { maxLength: 2 }), fc.dictionary(key, scalar, { maxKeys: 3 })), { minKeys: 1, maxKeys: 4 });
    fc.assert(fc.property(tree, key, scalar, fc.constantFrom(2, 4), (data, name, value, indent) => {
      const text = stringifyYaml(data, { indent, lineWidth: 0 });
      const first = Object.keys(data)[0];
      const candidates: ValidationFix[] = [
        set([first], value),
        remove([first]),
        ...(name in data ? [] : [add([name], value), rename([first], name)]),
      ];
      for (const f of candidates) {
        const edits = computeFixEdits(text, f, undefined, 'yaml');
        assert.strictEqual(edits.length, 1, `${f.kind} on\n${text}`);
        const expected: Record<string, unknown> = structuredClone(data);
        if (f.kind === 'remove-additional') { delete expected[first]; }
        else if (f.kind === 'rename-property') { expected[name] = expected[first]; delete expected[first]; }
        else { expected[String(f.path[0])] = value; }
        assert.deepStrictEqual(parseYaml(applyFix(text, f, undefined, 'yaml')), expected);
      }
    }), { numRuns: 200 });
  });
});

// ── TOML ─────────────────────────────────────────────────────────────────────

suite('[F21-FR-11] TOML quick fixes — positioned by the scan, never restructuring', () => {
  const DOC = 'title = "x"\n\n[server]\n  port = "80"  # c\n  extra = 1\n\n[[job]]\nname = 1\n';

  test('a value fix rewrites the literal and keeps the trailing comment', () => {
    assert.strictEqual(toml(DOC, set(['server', 'port'], 80)), DOC.replace('"80"', '80'));
    assert.strictEqual(toml(DOC, set(['job', 0, 'name'], '1')), DOC.replace('name = 1', 'name = "1"'));
    assert.strictEqual(toml(DOC, set(['title'], true)), DOC.replace('"x"', 'true'));
    assert.strictEqual(toml('a = [1, "2"]\n', set(['a', 1], 2)), 'a = [1, 2]\n');
    assert.strictEqual(toml('p = { x = "1" }\n', set(['p', 'x'], 1)), 'p = { x = 1 }\n');
  });

  test('values are written as TOML literals; what TOML cannot spell yields no fix', () => {
    assert.strictEqual(renderTomlValue('a"b\n'), '"a\\"b\\n"');
    assert.strictEqual(renderTomlValue('\u007f'), '"\\u007f"');
    assert.strictEqual(renderTomlValue(1.5), '1.5');
    assert.strictEqual(renderTomlValue(false), 'false');
    assert.strictEqual(renderTomlValue([1, 'a', [true]]), '[1, "a", [true]]');
    assert.strictEqual(renderTomlValue({ a: 1, 'b c': { d: [] } }), '{ a = 1, "b c" = { d = [] } }');
    assert.strictEqual(renderTomlValue({}), '{}');
    for (const unspeakable of [null, undefined, NaN, Infinity, [1, null], { a: null }, { a: { b: undefined } }]) {
      assert.strictEqual(renderTomlValue(unspeakable), undefined);
    }
    assert.strictEqual(renderTomlKey('plain_key-1'), 'plain_key-1');
    assert.strictEqual(renderTomlKey('needs quotes'), '"needs quotes"');
    assert.strictEqual(renderTomlKey(''), '""');
    none(DOC, set(['title'], null), 'toml');
    none(DOC, add(['server', 'host'], null), 'toml');
  });

  test('a rename rewrites the key of a `key = value` pair, including inside an inline table', () => {
    assert.strictEqual(toml(DOC, rename(['server', 'extra'], 'host')), DOC.replace('extra = 1', 'host = 1'));
    assert.strictEqual(toml(DOC, rename(['server', 'extra'], 'ho st')), DOC.replace('extra = 1', '"ho st" = 1'));
    assert.strictEqual(toml('p = { xx = 1, y = 2 }\n', rename(['p', 'xx'], 'x')), 'p = { x = 1, y = 2 }\n');
    none(DOC, rename(['server', 'extra'], 'port'), 'toml');
    none(DOC, rename(['server', 'missing'], 'host'), 'toml');
    none(DOC, fix('rename-property', ['server', 'extra']), 'toml');
  });

  test('a table is never renamed or removed: its name recurs in every header beneath it', () => {
    const text = '[server]\nx = 1\n[server.tls]\ny = 2\n[[job]]\nz = 3\na.b = 4\n';
    none(text, rename(['server'], 'servers'), 'toml');
    none(text, remove(['server']), 'toml');
    none(text, remove(['server', 'tls']), 'toml');
    none(text, remove(['job']), 'toml');
    none(text, rename(['job', 0, 'a'], 'c'), 'toml');
    none(text, remove(['job', 0, 'a']), 'toml');
    none(text, remove(['job', 0, 'a', 'b']), 'toml');
  });

  test('a removal deletes the whole statement, multi-line value and line break included', () => {
    assert.strictEqual(toml(DOC, remove(['server', 'extra'])), DOC.replace('  extra = 1\n', ''));
    assert.strictEqual(toml('a = [\n  1,\n]\nb = 2\n', remove(['a'])), 'b = 2\n');
    assert.strictEqual(toml('a = 1\nb = 2', remove(['b'])), 'a = 1\n');
    none('p = { x = 1, y = 2 }\n', remove(['p', 'x']), 'toml');
    none(DOC, remove(['server', 'missing']), 'toml');
  });

  test('an addition goes at the end of the owning table\'s pairs, indented like them', () => {
    assert.strictEqual(
      toml(DOC, add(['server', 'host'], '')),
      'title = "x"\n\n[server]\n  port = "80"  # c\n  extra = 1\n  host = ""\n\n[[job]]\nname = 1\n',
    );
    assert.strictEqual(toml(DOC, add(['tags'], [])), DOC.replace('title = "x"\n', 'title = "x"\ntags = []\n'));
    assert.strictEqual(toml(DOC, add(['job', 0, 'cmd'], 'run')), DOC + 'cmd = "run"\n');
    assert.strictEqual(toml(DOC, add(['server', 'my key'], {})), DOC.replace('  extra = 1\n', '  extra = 1\n  "my key" = {}\n'));
  });

  test('a root key with no root pairs is written ahead of the first header, set off by a blank line', () => {
    assert.strictEqual(toml('[a]\nx = 1\n', add(['name'], 'n')), 'name = "n"\n\n[a]\nx = 1\n');
    assert.strictEqual(toml('', add(['name'], 'n')), 'name = "n"\n');
    assert.strictEqual(toml('# only a comment\n', add(['name'], 1)), 'name = 1\n# only a comment\n');
  });

  test('an addition to a file with no final line break starts its own line', () => {
    assert.strictEqual(toml('a = 1', add(['b'], 2)), 'a = 1\nb = 2\n');
    assert.strictEqual(toml('[t]', add(['t', 'b'], 2)), '[t]\nb = 2\n');
  });

  test('no addition into an inline table, a dotted-key table, an existing key, or a non-table', () => {
    none('p = { x = 1 }\n', add(['p', 'y'], 2), 'toml');
    none('a.b = 1\n', add(['a', 'c'], 2), 'toml');
    none('a = 1\n', add(['a'], 2), 'toml');
    none('a = 1\n', add(['a', 'b'], 2), 'toml');
    none('a = 1\n', add(['missing', 'b'], 2), 'toml');
    none('a = \n', add(['b'], 2), 'toml');
  });

  test('[F21-FR-14] an edit whose result would not parse back to the intended data is discarded', () => {
    // A lone surrogate has a JSON spelling TOML rejects: the edit is built, then dropped.
    none(DOC, set(['title'], '\ud800'), 'toml');
    none(DOC, add(['server', 'host'], '\ud800'), 'toml');
  });

  test('[F21-FR-14] every edit offered on a printed document yields exactly the intended data', () => {
    const scalar = fc.oneof(
      fc.integer({ min: -1e6, max: 1e6 }),
      fc.boolean(),
      fc.string({ maxLength: 8 }).filter(s => !/[\u0000-\u001f\u007f\ud800-\udfff]/.test(s)),
    );
    const key = fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/);
    const tree = fc.dictionary(key, fc.oneof(scalar, fc.array(scalar, { maxLength: 2 }), fc.dictionary(key, scalar, { maxKeys: 3 })), { minKeys: 1, maxKeys: 4 });
    fc.assert(fc.property(tree, key, scalar, (data, name, value) => {
      const text = stringifyToml(data);
      for (const [k, v] of Object.entries(data)) {
        const isTable = v !== null && typeof v === 'object' && !Array.isArray(v);
        const candidates: ValidationFix[] = isTable
          ? (name in (v as object) ? [] : [add([k, name], value)])
          : [set([k], value), remove([k]), ...(name in data ? [] : [rename([k], name)])];
        for (const f of candidates) {
          const edits = computeFixEdits(text, f, undefined, 'toml');
          assert.strictEqual(edits.length, 1, `${f.kind} /${f.path.join('/')} on\n${text}`);
          const expected: Record<string, unknown> = structuredClone(data);
          if (f.kind === 'add-required') { (expected[k] as Record<string, unknown>)[name] = value; }
          else if (f.kind === 'remove-additional') { delete expected[k]; }
          else if (f.kind === 'rename-property') { expected[name] = expected[k]; delete expected[k]; }
          else { expected[k] = value; }
          assert.deepStrictEqual(plain(parseToml(applyFix(text, f, undefined, 'toml'))), expected);
        }
      }
    }), { numRuns: 200 });
  });
});

// ── JSONL ────────────────────────────────────────────────────────────────────

suite('[F21-FR-12] JSONL quick fixes — confined to the failing record\'s line', () => {
  const DOC = '{"a":1}\n\n  {"a":"2","x":1}  \n// note\n{"a":"3"}\n';

  test('records are the non-blank, non-comment lines, trimmed', () => {
    const spans = jsonlRecordSpans(DOC);
    assert.deepStrictEqual(spans.map(s => DOC.slice(s.start, s.end)), ['{"a":1}', '{"a":"2","x":1}', '{"a":"3"}']);
    assert.deepStrictEqual(parseJsonl(DOC), [{ a: 1 }, { a: '2', x: 1 }, { a: '3' }]);
    assert.deepStrictEqual(jsonlRecordSpans(''), []);
    assert.deepStrictEqual(jsonlRecordSpans('\n \r\n'), []);
    assert.deepStrictEqual(jsonlRecordSpans('{"a":1}\r\n{"b":2}').map(s => [s.start, s.end]), [[0, 7], [9, 16]]);
  });

  test('a fix edits its own record and leaves an identical path in other records alone', () => {
    assert.strictEqual(jsonl(DOC, set(['a'], 2, 1)), DOC.replace('"a":"2"', '"a":2'));
    assert.strictEqual(jsonl(DOC, set(['a'], 3, 2)), DOC.replace('"a":"3"', '"a":3'));
    assert.strictEqual(jsonl(DOC, remove(['x'], 1)), DOC.replace(',"x":1', ''));
    assert.strictEqual(jsonl(DOC, rename(['x'], 'y', 1)), DOC.replace('"x"', '"y"'));
  });

  test('an added property keeps the record on one line', () => {
    const fixed = jsonl(DOC, add(['b'], { k: [1] }, 0));
    assert.strictEqual(fixed.split('\n').length, DOC.split('\n').length);
    assert.deepStrictEqual(parseJsonl(fixed)[0], { a: 1, b: { k: [1] } });
    assert.deepStrictEqual(parseJsonl(fixed).slice(1), parseJsonl(DOC).slice(1));
  });

  test('no edit without a record, for a record that is gone, or for a stale target', () => {
    none(DOC, set(['a'], 2), 'jsonl');
    none(DOC, set(['a'], 2, 7), 'jsonl');
    none(DOC, remove(['x'], 0), 'jsonl');
    none('{"a":1}\nnot json\n', set(['a'], 2, 0), 'jsonl');
  });

  test('a diagnostic is located inside its record, the record itself standing in for the root', () => {
    assert.deepStrictEqual(locateInstanceSpan(DOC, 'jsonl', '/a', 1), { start: DOC.indexOf('"a":"2"'), end: DOC.indexOf('"a":"2"') + 3 });
    assert.strictEqual(locateInstancePath(DOC, '/a', 'jsonl', 2), 4);
    assert.strictEqual(locateInstancePath(DOC, '/a', 'jsonl', 0), 0);
    assert.strictEqual(locateInstancePath(DOC, '', 'jsonl', 1), 2);
    assert.deepStrictEqual(locateInstanceSpan(DOC, 'jsonl', '/missing', 1), { start: 11, end: 26 });
    assert.strictEqual(locateInstanceSpan(DOC, 'jsonl', '/a', 9), undefined);
    // Without a record the old name scan still answers (first occurrence).
    assert.strictEqual(locateInstancePath(DOC, '/a', 'jsonl'), 0);
  });

  test('the workspace report places each JSONL issue on its own record\'s line', () => {
    const schema = { type: 'object', properties: { a: { type: 'integer' } } };
    assert.deepStrictEqual(
      validateInstances(parseJsonl(DOC), schema, DOC, 'jsonl').map(i => i.line),
      [2, 4],
    );
  });

  test('[F21-FR-08] the diagnostic code carries the record number, so equal paths do not collide', () => {
    assert.strictEqual(diagnosticCode('/a'), '/a');
    assert.strictEqual(diagnosticCode(''), '/');
    assert.strictEqual(diagnosticCode('/a', 0), '#1/a');
    assert.strictEqual(diagnosticCode('', 4), '#5/');
    assert.strictEqual(fixDiagnosticCode(set(['a'], 2, 1)), '#2/a');
    assert.strictEqual(fixDiagnosticCode(add(['b'], 1, 1)), '#2/');
    assert.strictEqual(fixDiagnosticCode(set(['a'], 2)), '/a');
    assert.notStrictEqual(fixDiagnosticCode(set(['a'], 2, 1)), fixDiagnosticCode(set(['a'], 2, 2)));
  });
});

// ── Fix all ──────────────────────────────────────────────────────────────────

suite('[F21-FR-13] fix all — every fix that needs no decision, and no other', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string' },
      age: { type: 'integer' },
      env: { enum: ['development', 'staging', 'production'] },
      kind: { const: 'fixed' },
      colour: { enum: ['red', 'green'] },
      description: { type: 'string' },
    },
  };
  const data = { age: '5', env: 'prodution', kind: 'other', colour: 'zzzzzz', descripton: 'd', extra: 1 };
  const errors = [
    { keyword: 'required', instancePath: '', params: { missingProperty: 'name' } },
    { keyword: 'type', instancePath: '/age', params: { type: 'integer' } },
    { keyword: 'enum', instancePath: '/env', params: { allowedValues: schema.properties.env.enum } },
    { keyword: 'const', instancePath: '/kind', params: { allowedValue: 'fixed' } },
    { keyword: 'enum', instancePath: '/colour', params: { allowedValues: ['red', 'green'] } },
    { keyword: 'additionalProperties', instancePath: '', params: { additionalProperty: 'descripton' } },
    { keyword: 'additionalProperties', instancePath: '', params: { additionalProperty: 'extra' } },
  ];
  const fixes = buildFixes(errors, schema, data);

  test('selects unambiguous kinds and preferred near-misses; never a removal or an unranked enum', () => {
    const selected = selectAutoFixes(fixes);
    assert.deepStrictEqual(
      selected.map(f => [f.kind, f.path.join('/')]),
      [['add-required', 'name'], ['coerce-type', 'age'], ['set-enum', 'env'], ['set-const', 'kind'], ['rename-property', 'descripton']],
    );
    assert.ok(selected.every(f => f.kind !== 'remove-additional'));
    assert.strictEqual(selected.find(f => f.kind === 'set-enum')!.value, 'production');
  });

  test('applies at most one fix per node', () => {
    const twice = [set(['a'], 1), fix('set-const', ['a'], { value: 2 }), set(['b'], 3)];
    assert.deepStrictEqual(selectAutoFixes(twice).map(f => f.value), [1, 3]);
    // The same path in two JSONL records is two nodes.
    assert.strictEqual(selectAutoFixes([set(['a'], 1, 0), set(['a'], 1, 1)]).length, 2);
  });

  test('one edit applies them all, in every format, leaving only what needs a decision', () => {
    const expected = { name: '', age: 5, env: 'production', kind: 'fixed', colour: 'zzzzzz', description: 'd', extra: 1 };
    const json = JSON.stringify(data, null, 2);
    const all = computeFixAllEdits(json, fixes);
    assert.strictEqual(all.applied, 5);
    assert.strictEqual(all.edits.length, 1);
    const apply = (text: string, languageId: string) => {
      const { edits, applied } = computeFixAllEdits(text, fixes, undefined, languageId);
      assert.strictEqual(applied, 5, languageId);
      const [e] = edits;
      return text.slice(0, e.offset) + e.content + text.slice(e.offset + e.length);
    };
    assert.deepStrictEqual(JSON.parse(apply(json, 'json')), expected);
    assert.deepStrictEqual(parseYaml(apply(stringifyYaml(data), 'yaml')), expected);
    assert.deepStrictEqual(plain(parseToml(apply(stringifyToml(data), 'toml'))), expected);
  });

  test('the edit is minimal: only the span between the first and last change is replaced', () => {
    const text = '{\n  "keep": 0,\n  "a": "1",\n  "b": "2",\n  "tail": 0\n}';
    const { edits, applied } = computeFixAllEdits(text, [set(['a'], 1), set(['b'], 2)]);
    assert.strictEqual(applied, 2);
    assert.deepStrictEqual(edits, [{ offset: text.indexOf('"1"'), length: '"1",\n  "b": "2"'.length, content: '1,\n  "b": 2' }]);
  });

  test('a fix that no longer applies is skipped, and nothing to do is no edit', () => {
    const text = '{"a":"1"}';
    assert.deepStrictEqual(computeFixAllEdits(text, [set(['gone'], 1), set(['a'], 1)]), {
      edits: [{ offset: 5, length: 3, content: '1' }],
      applied: 1,
    });
    assert.deepStrictEqual(computeFixAllEdits(text, [remove(['a'])]), { edits: [], applied: 0 });
    assert.deepStrictEqual(computeFixAllEdits(text, []), { edits: [], applied: 0 });
    // Applying a fix that changes nothing counts for nothing.
    assert.deepStrictEqual(computeFixAllEdits('{"a":1}', [set(['a'], 1)]).edits, []);
  });

  test('JSONL fixes across records are applied together, each on its own line', () => {
    const text = '{"a":"1"}\n{"a":"2"}\n';
    const { edits, applied } = computeFixAllEdits(text, [set(['a'], 1, 0), set(['a'], 2, 1)], undefined, 'jsonl');
    assert.strictEqual(applied, 2);
    const [e] = edits;
    assert.strictEqual(text.slice(0, e.offset) + e.content + text.slice(e.offset + e.length), '{"a":1}\n{"a":2}\n');
  });
});
