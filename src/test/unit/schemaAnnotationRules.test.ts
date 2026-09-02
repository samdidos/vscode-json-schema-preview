import * as assert from 'assert';
import fc from 'fast-check';

const { lintSchema } = require('../../schemaLinter');

interface Finding { ruleId: string; message: string; offset: number; length: number; defaultSeverity: string }

const findings = (schema: object, ruleId: string, languageId = 'json'): Finding[] =>
  (lintSchema(JSON.stringify(schema, null, 2), languageId) as Finding[]).filter(f => f.ruleId === ruleId);

const examplesOf = (schema: object) => findings(schema, 'valid-examples');
const defaultsOf = (schema: object) => findings(schema, 'valid-default');

suite('[F17-FR-13] valid-examples — examples must satisfy their own subschema', () => {
  test('flags an example contradicting the subschema that declares it', () => {
    const found = examplesOf({
      properties: { age: { type: 'integer', examples: [42, 'not a number'] } },
    });
    assert.strictEqual(found.length, 1);
    assert.match(found[0].message, /Example 2/);
    assert.strictEqual(found[0].defaultSeverity, 'warning');
  });

  test('accepts examples that all satisfy the subschema', () => {
    assert.deepStrictEqual(examplesOf({ properties: { age: { type: 'integer', examples: [1, 2] } } }), []);
  });

  test('checks constraints beyond type', () => {
    assert.strictEqual(examplesOf({ properties: { n: { type: 'integer', maximum: 10, examples: [11] } } }).length, 1);
    assert.strictEqual(examplesOf({ properties: { s: { enum: ['a', 'b'], examples: ['c'] } } }).length, 1);
    assert.strictEqual(
      examplesOf({ properties: { s: { type: 'string', minLength: 3, examples: ['ab'] } } }).length, 1);
  });

  test('flags every offending example, not just the first', () => {
    assert.strictEqual(examplesOf({ properties: { n: { type: 'integer', examples: ['a', 'b', 3] } } }).length, 2);
  });

  test('points at the offending example, not the whole array', () => {
    const text = JSON.stringify({ properties: { n: { type: 'integer', examples: [1, 'bad'] } } }, null, 2);
    const [found] = (lintSchema(text, 'json') as Finding[]).filter(f => f.ruleId === 'valid-examples');
    assert.strictEqual(text.slice(found.offset, found.offset + found.length), '"bad"');
  });

  test('checks examples on the root schema too', () => {
    assert.strictEqual(examplesOf({ type: 'object', required: ['a'], examples: [{}] }).length, 1);
  });

  test('checks examples on a nested object schema', () => {
    const found = examplesOf({
      properties: { a: { type: 'object', properties: { b: { type: 'string', examples: [1] } } } },
    });
    assert.strictEqual(found.length, 1);
  });

  test('ignores a non-array examples value', () => {
    assert.deepStrictEqual(examplesOf({ properties: { n: { type: 'integer', examples: 'x' } } }), []);
  });

  test('works on YAML sources', () => {
    const yaml = ['properties:', '  age:', '    type: integer', '    examples:', '      - hello'].join('\n');
    const found = (lintSchema(yaml, 'yaml') as Finding[]).filter(f => f.ruleId === 'valid-examples');
    assert.strictEqual(found.length, 1);
  });
});

suite('[F17-FR-14] valid-default — default must satisfy its own subschema', () => {
  test('flags a default that contradicts the subschema', () => {
    const found = defaultsOf({ properties: { age: { type: 'integer', default: 'unknown' } } });
    assert.strictEqual(found.length, 1);
    assert.match(found[0].message, /"default" value does not satisfy/);
  });

  test('accepts a default that satisfies the subschema', () => {
    assert.deepStrictEqual(defaultsOf({ properties: { age: { type: 'integer', default: 0 } } }), []);
  });

  test('points at the default value', () => {
    const text = JSON.stringify({ properties: { n: { type: 'integer', default: 'x' } } }, null, 2);
    const [found] = (lintSchema(text, 'json') as Finding[]).filter(f => f.ruleId === 'valid-default');
    assert.strictEqual(text.slice(found.offset, found.offset + found.length), '"x"');
  });

  test('flags a default outside an enum', () => {
    assert.strictEqual(defaultsOf({ properties: { s: { enum: ['a', 'b'], default: 'c' } } }).length, 1);
  });

  test('accepts a null default against a nullable type', () => {
    assert.deepStrictEqual(defaultsOf({ properties: { s: { type: ['string', 'null'], default: null } } }), []);
  });
});

suite('[F17-FR-15] annotation rules skip what they cannot evaluate', () => {
  test('skips a subschema carrying a $ref', () => {
    const schema = {
      $defs: { Age: { type: 'integer' } },
      properties: { age: { $ref: '#/$defs/Age', examples: ['not a number'], default: 'x' } },
    };
    assert.deepStrictEqual(examplesOf(schema), []);
    assert.deepStrictEqual(defaultsOf(schema), []);
  });

  test('skips a subschema whose constraints contain a nested $ref', () => {
    const schema = {
      $defs: { Item: { type: 'integer' } },
      properties: { list: { type: 'array', items: { $ref: '#/$defs/Item' }, examples: [['a']] } },
    };
    assert.deepStrictEqual(examplesOf(schema), []);
  });

  test('skips an annotation-only subschema, which constrains nothing', () => {
    const schema = { properties: { a: { title: 'A', description: 'x', examples: [1, 'two', null] } } };
    assert.deepStrictEqual(examplesOf(schema), []);
  });

  test('skips a subschema Ajv cannot compile rather than reporting it', () => {
    assert.deepStrictEqual(examplesOf({ properties: { a: { type: 'not-a-type', examples: [1] } } }), []);
  });

  test('does not treat $schema/$id as constraints', () => {
    const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'x', examples: [1] };
    assert.deepStrictEqual(examplesOf(schema), []);
  });
});

suite('[F17-FR-13] annotation rules are total', () => {
  test('never throw on arbitrary JSON documents', () => {
    fc.assert(
      fc.property(fc.jsonValue(), value => {
        lintSchema(JSON.stringify(value), 'json');
        return true;
      }),
      { numRuns: 200 },
    );
  });

  test('leave the existing rule set untouched', () => {
    const all = lintSchema(JSON.stringify({ properties: { a: { type: 'string' } } }, null, 2), 'json') as Finding[];
    assert.ok(all.some(f => f.ruleId === 'require-schema-declaration'));
    assert.ok(all.some(f => f.ruleId === 'require-descriptions'));
    assert.ok(!all.some(f => f.ruleId === 'valid-examples' || f.ruleId === 'valid-default'));
  });
});
