import * as assert from 'assert';
import { lintSchema, buildSchemaTree, editDistance } from '../../schemaLinter';

function ids(text: string, lang = 'json'): string[] {
  return lintSchema(text, lang).map(f => f.ruleId);
}

suite('[F17-NFR-01] buildSchemaTree()', () => {
  test('parses a JSON object with offsets', () => {
    const tree = buildSchemaTree('{"a":1}', 'json');
    assert.ok(tree && tree.kind === 'object');
  });
  test('parses a YAML mapping', () => {
    const tree = buildSchemaTree('a: 1\n', 'yaml');
    assert.ok(tree && tree.kind === 'object');
  });
  test('returns undefined on empty input', () => {
    assert.strictEqual(buildSchemaTree('', 'json'), undefined);
    assert.strictEqual(buildSchemaTree('', 'yaml'), undefined);
  });
});

suite('editDistance()', () => {
  test('counts single edits', () => {
    assert.strictEqual(editDistance('requird', 'required'), 1);
    assert.strictEqual(editDistance('type', 'type'), 0);
    assert.strictEqual(editDistance('additionaProperties', 'additionalProperties'), 1);
  });
});

suite('[F17-FR-05] require-schema-declaration', () => {
  test('flags a root without $schema', () => {
    assert.ok(ids('{"type":"object"}').includes('require-schema-declaration'));
  });
  test('does not flag when $schema is present', () => {
    assert.ok(!ids('{"$schema":"x","type":"object"}').includes('require-schema-declaration'));
  });
});

suite('[F17-FR-06] require-root-id', () => {
  test('flags a root without $id', () => {
    assert.ok(ids('{"$schema":"x"}').includes('require-root-id'));
  });
  test('accepts draft-04 "id" too', () => {
    assert.ok(!ids('{"$schema":"x","id":"urn:x"}').includes('require-root-id'));
  });
});

suite('[F17-FR-07] require-descriptions', () => {
  test('flags the root when it has neither title nor description', () => {
    const rules = ids('{"$schema":"x","$id":"i","type":"object"}');
    assert.ok(rules.includes('require-descriptions'));
  });
  test('flags a property lacking a description', () => {
    const text = '{"$schema":"x","$id":"i","title":"T","type":"object","properties":{"a":{"type":"string"}}}';
    const rules = lintSchema(text, 'json').filter(f => f.ruleId === 'require-descriptions');
    assert.ok(rules.some(f => f.message.includes('"a"')));
  });
  test('does not flag a described property', () => {
    const text = '{"$schema":"x","$id":"i","title":"T","type":"object","properties":{"a":{"type":"string","description":"the a"}}}';
    const rules = lintSchema(text, 'json').filter(f => f.ruleId === 'require-descriptions' && f.message.includes('"a"'));
    assert.strictEqual(rules.length, 0);
  });
});

suite('[F17-FR-04] no-unknown-keywords', () => {
  test('flags a misspelled keyword and suggests the nearest', () => {
    const f = lintSchema('{"$schema":"x","requird":["a"]}', 'json').find(x => x.ruleId === 'no-unknown-keywords');
    assert.ok(f);
    assert.match(f!.message, /requird/);
    assert.match(f!.message, /required/);
  });
  test('does not flag known keywords', () => {
    assert.ok(!ids('{"$schema":"x","type":"object","minLength":1}').includes('no-unknown-keywords'));
  });
  test('does not flag x- vendor extensions', () => {
    assert.ok(!ids('{"$schema":"x","x-internal":true}').includes('no-unknown-keywords'));
  });
  test('does not flag names inside properties or $defs', () => {
    const text = '{"$schema":"x","properties":{"weirdName":{"type":"string","description":"d"}},"$defs":{"also_weird":{"type":"number"}}}';
    assert.ok(!ids(text).includes('no-unknown-keywords'));
  });
});

suite('[F17-FR-08] explicit-additional-properties', () => {
  test('flags an object with properties but no additionalProperties', () => {
    const text = '{"$schema":"x","$id":"i","title":"T","type":"object","properties":{"a":{"type":"string","description":"d"}}}';
    assert.ok(ids(text).includes('explicit-additional-properties'));
  });
  test('does not flag when additionalProperties is set', () => {
    const text = '{"$schema":"x","$id":"i","title":"T","type":"object","additionalProperties":false,"properties":{"a":{"type":"string","description":"d"}}}';
    assert.ok(!ids(text).includes('explicit-additional-properties'));
  });
});

suite('[F17-FR-09] no-duplicate-enum', () => {
  test('flags duplicate scalar enum values', () => {
    assert.ok(ids('{"$schema":"x","enum":[1,1,2]}').includes('no-duplicate-enum'));
  });
  test('does not flag a unique enum', () => {
    assert.ok(!ids('{"$schema":"x","enum":[1,2,3]}').includes('no-duplicate-enum'));
  });
  test('offers a dedupe fix for JSON', () => {
    const f = lintSchema('{"$schema":"x","enum":[1,1,2]}', 'json').find(x => x.ruleId === 'no-duplicate-enum');
    assert.ok(f?.fix);
    assert.strictEqual(f!.fix!.kind, 'replaceRange');
    assert.strictEqual(f!.fix!.text, '[1, 2]');
  });
});

suite('[F17-FR-10] no-empty-required', () => {
  test('flags a required name absent from properties when closed', () => {
    const text = '{"$schema":"x","$id":"i","title":"T","type":"object","additionalProperties":false,"properties":{"a":{"type":"string","description":"d"}},"required":["a","ghost"]}';
    const f = lintSchema(text, 'json').filter(x => x.ruleId === 'no-empty-required');
    assert.strictEqual(f.length, 1);
    assert.match(f[0].message, /ghost/);
  });
  test('does not flag when additionalProperties is not false', () => {
    const text = '{"$schema":"x","$id":"i","title":"T","type":"object","properties":{"a":{"type":"string","description":"d"}},"required":["a","ghost"]}';
    assert.ok(!ids(text).includes('no-empty-required'));
  });
});

suite('[F17-FR-11] findings carry a rule id and a precise range', () => {
  test('each finding has a positive-length or anchored range and its ruleId as code', () => {
    const text = '{"$schema":"x","requird":["a"]}';
    const f = lintSchema(text, 'json').find(x => x.ruleId === 'no-unknown-keywords')!;
    assert.strictEqual(text.slice(f.offset, f.offset + f.length), '"requird"');
  });
});

suite('lintSchema — non-object roots', () => {
  test('returns no findings for a non-object schema document', () => {
    assert.deepStrictEqual(lintSchema('[1,2,3]', 'json'), []);
    assert.deepStrictEqual(lintSchema('42', 'json'), []);
    assert.deepStrictEqual(lintSchema('', 'json'), []);
  });
});

suite('[F17-FR-04] YAML linting', () => {
  test('flags an unknown keyword in YAML with a source range', () => {
    const text = ['$schema: x', 'requird:', '  - a', ''].join('\n');
    const f = lintSchema(text, 'yaml').find(x => x.ruleId === 'no-unknown-keywords');
    assert.ok(f);
    assert.strictEqual(text.slice(f!.offset, f!.offset + f!.length), 'requird');
  });
});
