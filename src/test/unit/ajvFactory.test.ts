import * as assert from 'assert';
import { draftOf, createAjv } from '../../ajvFactory';

suite('[F03-FR-15] draftOf()', () => {
  test('classifies a 2020-12 $schema', () => {
    assert.strictEqual(draftOf({ $schema: 'https://json-schema.org/draft/2020-12/schema' }), '2020-12');
  });

  test('classifies a 2019-09 $schema', () => {
    assert.strictEqual(draftOf({ $schema: 'https://json-schema.org/draft/2019-09/schema' }), '2019-09');
  });

  test('falls back to draft-07 for a draft-07 $schema', () => {
    assert.strictEqual(draftOf({ $schema: 'http://json-schema.org/draft-07/schema#' }), 'draft-07');
  });

  test('falls back to draft-07 when $schema is absent', () => {
    assert.strictEqual(draftOf({ type: 'object' }), 'draft-07');
  });

  test('falls back to draft-07 for a non-object or non-string $schema', () => {
    assert.strictEqual(draftOf(null), 'draft-07');
    assert.strictEqual(draftOf('nope'), 'draft-07');
    assert.strictEqual(draftOf({ $schema: 42 }), 'draft-07');
  });
});

suite('[F03-FR-15] createAjv()', () => {
  test('2020-12 dialect enforces prefixItems (ignored under draft-07)', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }],
      items: false,
    };
    const validate = createAjv(schema, { strict: false }).compile(schema);
    assert.strictEqual(validate(['ok']), true);
    assert.strictEqual(validate([123]), false); // wrong type in first slot
    assert.strictEqual(validate(['ok', 'extra']), false); // items:false forbids extras
  });

  test('2019-09 dialect enforces unevaluatedProperties', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'object',
      properties: { a: { type: 'string' } },
      unevaluatedProperties: false,
    };
    const validate = createAjv(schema, { strict: false }).compile(schema);
    assert.strictEqual(validate({ a: 'x' }), true);
    assert.strictEqual(validate({ a: 'x', b: 'y' }), false);
  });

  test('draft-07 dialect compiles an ordinary schema', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    const validate = createAjv(schema, { strict: false }).compile(schema);
    assert.strictEqual(validate({ name: 'Alice' }), true);
    assert.strictEqual(validate({ name: 5 }), false);
  });
});
