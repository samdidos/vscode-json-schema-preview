import * as assert from 'assert';
import { migrateSchema, type TargetDraft } from '../../draftMigration';

/** Migrate and return just the schema (drops the change log). */
function to(schema: unknown, target: TargetDraft): any {
  return migrateSchema(schema, target).schema;
}
/** The change descriptions, for asserting what was reported. */
function changes(schema: unknown, target: TargetDraft): string[] {
  return migrateSchema(schema, target).changes.map(c => c.change);
}

const META_2020 = 'https://json-schema.org/draft/2020-12/schema';
const META_2019 = 'https://json-schema.org/draft/2019-09/schema';
const META_07 = 'http://json-schema.org/draft-07/schema#';

suite('[F22-FR-02][F22-NFR-02] migrateSchema() — $schema meta-schema', () => {
  test('sets the target meta-schema at the root', () => {
    assert.strictEqual(to({}, '2020-12').$schema, META_2020);
    assert.strictEqual(to({}, '2019-09').$schema, META_2019);
    assert.strictEqual(to({}, 'draft-07').$schema, META_07);
  });

  test('overrides an existing $schema declaring a different draft', () => {
    // Regression: setMetaSchema spread the source object AFTER `$schema: want`,
    // so an existing (older) $schema silently overrode the target draft.
    const out = to({ $schema: META_07, type: 'object' }, '2020-12');
    assert.strictEqual(out.$schema, META_2020);
    const back = to({ $schema: META_2020 }, 'draft-07');
    assert.strictEqual(back.$schema, META_07);
  });

  test('keeps $schema as the first key after overriding it', () => {
    const out = to({ $schema: META_07, title: 'X' }, '2020-12');
    assert.strictEqual(Object.keys(out)[0], '$schema');
  });

  test('does not mutate the input', () => {
    const input = { definitions: { X: {} } };
    migrateSchema(input, '2020-12');
    assert.deepStrictEqual(input, { definitions: { X: {} } });
  });
});

suite('[F22-FR-03] migrateSchema() — id → $id', () => {
  test('renames id to $id at any depth', () => {
    const out = to({ id: 'root', properties: { a: { id: 'nested' } } }, '2020-12');
    assert.strictEqual(out.$id, 'root');
    assert.ok(!('id' in out));
    assert.strictEqual(out.properties.a.$id, 'nested');
  });

  test('leaves id alone when $id already exists', () => {
    const out = to({ id: 'old', $id: 'new' }, '2020-12');
    assert.strictEqual(out.$id, 'new');
    assert.strictEqual(out.id, 'old');
  });
});

suite('[F22-FR-04] migrateSchema() — exclusive bounds', () => {
  test('boolean exclusiveMinimum true → numeric form', () => {
    const out = to({ minimum: 0, exclusiveMinimum: true }, 'draft-07');
    assert.strictEqual(out.exclusiveMinimum, 0);
    assert.ok(!('minimum' in out));
  });

  test('boolean exclusiveMaximum true → numeric form', () => {
    const out = to({ maximum: 10, exclusiveMaximum: true }, 'draft-07');
    assert.strictEqual(out.exclusiveMaximum, 10);
    assert.ok(!('maximum' in out));
  });

  test('boolean false is simply dropped', () => {
    const out = to({ minimum: 0, exclusiveMinimum: false }, 'draft-07');
    assert.strictEqual(out.minimum, 0);
    assert.ok(!('exclusiveMinimum' in out));
  });

  test('an already-numeric exclusiveMinimum is left untouched', () => {
    assert.strictEqual(migrateSchema({ exclusiveMinimum: 3 }, 'draft-07').changes.filter(c => /exclusiveMinimum/.test(c.change)).length, 0);
  });
});

suite('[F22-FR-05] migrateSchema() — definitions ↔ $defs and $ref rewrite', () => {
  const draft07Schema = {
    definitions: { X: { type: 'string' } },
    properties: { a: { $ref: '#/definitions/X' } },
  };

  test('upgrades definitions → $defs and rewrites the local $ref', () => {
    const out = to(draft07Schema, '2020-12');
    assert.ok(out.$defs && !('definitions' in out));
    assert.strictEqual(out.properties.a.$ref, '#/$defs/X');
  });

  test('downgrades $defs → definitions and rewrites back', () => {
    const out = to({ $defs: { X: {} }, properties: { a: { $ref: '#/$defs/X' } } }, 'draft-07');
    assert.ok(out.definitions && !('$defs' in out));
    assert.strictEqual(out.properties.a.$ref, '#/definitions/X');
  });

  test('leaves a non-local $ref untouched', () => {
    const out = to({ properties: { a: { $ref: 'https://x/schema.json#/definitions/X' } } }, '2020-12');
    assert.strictEqual(out.properties.a.$ref, 'https://x/schema.json#/definitions/X');
  });
});

suite('[F22-FR-06] migrateSchema() — tuple items ↔ prefixItems', () => {
  test('to 2020-12: array items → prefixItems, additionalItems → items', () => {
    const out = to({ items: [{ type: 'string' }], additionalItems: { type: 'number' } }, '2020-12');
    assert.deepStrictEqual(out.prefixItems, [{ type: 'string' }]);
    assert.deepStrictEqual(out.items, { type: 'number' });
    assert.ok(!('additionalItems' in out));
  });

  test('round-trips 2020-12 → draft-07', () => {
    const out = to({ prefixItems: [{ type: 'string' }], items: { type: 'number' } }, 'draft-07');
    assert.deepStrictEqual(out.items, [{ type: 'string' }]);
    assert.deepStrictEqual(out.additionalItems, { type: 'number' });
    assert.ok(!('prefixItems' in out));
  });

  test('a plain (non-tuple) items schema is left as a schema and still recursed', () => {
    const out = to({ items: { id: 'x' } }, '2020-12');
    assert.strictEqual(out.items.$id, 'x'); // recursion reached it
    assert.ok(!('prefixItems' in out));
  });
});

suite('[F22-FR-07] migrateSchema() — dependencies split/merge', () => {
  test('to 2019-09: splits into dependentRequired / dependentSchemas', () => {
    const out = to({ dependencies: { a: ['b'], c: { required: ['d'] } } }, '2019-09');
    assert.deepStrictEqual(out.dependentRequired, { a: ['b'] });
    assert.deepStrictEqual(out.dependentSchemas, { c: { required: ['d'] } });
    assert.ok(!('dependencies' in out));
  });

  test('to draft-07: merges the two back into dependencies', () => {
    const out = to({ dependentRequired: { a: ['b'] }, dependentSchemas: { c: { required: ['d'] } } }, 'draft-07');
    assert.deepStrictEqual(out.dependencies, { a: ['b'], c: { required: ['d'] } });
    assert.ok(!('dependentRequired' in out) && !('dependentSchemas' in out));
  });
});

suite('[F22-FR-08] migrateSchema() — recursion coverage', () => {
  test('transforms nested schemas under allOf/anyOf/oneOf and $defs', () => {
    const out = to({
      allOf: [{ id: 'a' }],
      $defs: { d: { id: 'b' } },
      not: { id: 'c' },
    }, '2020-12');
    assert.strictEqual(out.allOf[0].$id, 'a');
    assert.strictEqual(out.$defs.d.$id, 'b');
    assert.strictEqual(out.not.$id, 'c');
  });
});

suite('[F22-FR-09] migrateSchema() — no-op when already conforming', () => {
  test('a 2020-12 schema with no legacy keywords reports zero changes', () => {
    const schema = { $schema: META_2020, type: 'object', properties: { a: { type: 'string' } } };
    assert.deepStrictEqual(changes(schema, '2020-12'), []);
  });

  test('migrating to the same draft twice is idempotent', () => {
    const once = to({ definitions: { X: {} }, id: 'r' }, '2020-12');
    assert.deepStrictEqual(changes(once, '2020-12'), []);
  });
});
