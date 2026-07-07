import * as assert from 'assert';
import * as fc from 'fast-check';
import {
  diffSchemas, deepEqual, summarise, summaryLine, renderReport, type DiffEntry, type DiffKind,
} from '../../schemaDiff';

/** Find the entry at a pointer path (first match). */
function at(entries: DiffEntry[], path: string): DiffEntry | undefined {
  return entries.find(e => e.path === path);
}
function kindsAt(entries: DiffEntry[], path: string): DiffKind[] {
  return entries.filter(e => e.path === path).map(e => e.kind);
}

suite('[F15-FR-04] deepEqual() — order-insensitive', () => {
  test('objects equal regardless of key order', () => {
    assert.ok(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }));
  });
  test('arrays compared by order', () => {
    assert.ok(deepEqual([1, 2], [1, 2]));
    assert.ok(!deepEqual([1, 2], [2, 1]));
  });
});

suite('[F15-FR-04] diffSchemas() — no structural change', () => {
  test('reordered keys produce no entries', () => {
    const a = { type: 'object', title: 'X', properties: { a: { type: 'string' } } };
    const b = { properties: { a: { type: 'string' } }, title: 'X', type: 'object' };
    assert.deepStrictEqual(diffSchemas(a, b), []);
  });
});

suite('[F15-FR-05] diffSchemas() — breaking changes', () => {
  test('a name added to required', () => {
    const e = diffSchemas({ required: ['a'] }, { required: ['a', 'b'] });
    assert.deepStrictEqual(kindsAt(e, '/required'), ['breaking']);
  });
  test('a property removed while additionalProperties is false', () => {
    const oldS = { additionalProperties: false, properties: { a: {}, b: {} } };
    const newS = { additionalProperties: false, properties: { a: {} } };
    assert.strictEqual(at(diffSchemas(oldS, newS), '/properties/b')?.kind, 'breaking');
  });
  test('a type removed', () => {
    const e = diffSchemas({ type: ['string', 'null'] }, { type: 'string' });
    assert.strictEqual(at(e, '/type')?.kind, 'breaking');
  });
  test('an enum value removed', () => {
    const e = diffSchemas({ enum: ['a', 'b'] }, { enum: ['a'] });
    assert.strictEqual(at(e, '/enum')?.kind, 'breaking');
  });
  test('const changed', () => {
    assert.strictEqual(at(diffSchemas({ const: 1 }, { const: 2 }), '/const')?.kind, 'breaking');
  });
  test('minimum raised', () => {
    assert.strictEqual(at(diffSchemas({ minimum: 0 }, { minimum: 5 }), '/minimum')?.kind, 'breaking');
  });
  test('maxLength lowered', () => {
    assert.strictEqual(at(diffSchemas({ maxLength: 10 }, { maxLength: 5 }), '/maxLength')?.kind, 'breaking');
  });
  test('additionalProperties true → false', () => {
    assert.strictEqual(at(diffSchemas({ additionalProperties: true }, { additionalProperties: false }), '/additionalProperties')?.kind, 'breaking');
  });
  test('an allOf branch added', () => {
    const e = diffSchemas({ allOf: [{ type: 'object' }] }, { allOf: [{ type: 'object' }, { required: ['x'] }] });
    assert.strictEqual(at(e, '/allOf')?.kind, 'breaking');
  });
});

suite('[F15-FR-06] diffSchemas() — non-breaking changes', () => {
  test('an optional property added', () => {
    const e = diffSchemas({ properties: { a: {} } }, { properties: { a: {}, b: { type: 'string' } } });
    assert.strictEqual(at(e, '/properties/b')?.kind, 'non-breaking');
  });
  test('a name removed from required', () => {
    assert.strictEqual(at(diffSchemas({ required: ['a', 'b'] }, { required: ['a'] }), '/required')?.kind, 'non-breaking');
  });
  test('a constraint relaxed (minimum lowered)', () => {
    assert.strictEqual(at(diffSchemas({ minimum: 5 }, { minimum: 0 }), '/minimum')?.kind, 'non-breaking');
  });
  test('enum values added', () => {
    assert.strictEqual(at(diffSchemas({ enum: ['a'] }, { enum: ['a', 'b'] }), '/enum')?.kind, 'non-breaking');
  });
  test('a type added to a type array', () => {
    assert.strictEqual(at(diffSchemas({ type: 'string' }, { type: ['string', 'null'] }), '/type')?.kind, 'non-breaking');
  });
});

suite('[F15-FR-07] diffSchemas() — informational changes', () => {
  test('description edited', () => {
    assert.strictEqual(at(diffSchemas({ description: 'old' }, { description: 'new' }), '/description')?.kind, 'informational');
  });
  test('an unknown/extension keyword changed', () => {
    assert.strictEqual(at(diffSchemas({ 'x-vendor': 1 }, { 'x-vendor': 2 }), '/x-vendor')?.kind, 'informational');
  });
  test('title/examples/default are informational', () => {
    const e = diffSchemas({ title: 'a', examples: [1], default: 0 }, { title: 'b', examples: [2], default: 9 });
    assert.ok(e.every(x => x.kind === 'informational'));
  });
});

suite('[F15-FR-08] diffSchemas() — unclassified & robustness', () => {
  test('a wholesale scalar replacement is unclassified, never dropped', () => {
    const e = diffSchemas({ properties: { a: { type: 'string' } } }, { properties: { a: true } });
    assert.strictEqual(at(e, '/properties/a')?.kind, 'unclassified');
  });
  test('nested property changes carry the correct pointer path', () => {
    const oldS = { properties: { user: { properties: { age: { minimum: 0 } } } } };
    const newS = { properties: { user: { properties: { age: { minimum: 18 } } } } };
    assert.strictEqual(at(diffSchemas(oldS, newS), '/properties/user/properties/age/minimum')?.kind, 'breaking');
  });
});

suite('diffSchemas() — additional rules', () => {
  test('multipleOf added is breaking, removed is non-breaking', () => {
    assert.strictEqual(at(diffSchemas({}, { multipleOf: 2 }), '/multipleOf')?.kind, 'breaking');
    assert.strictEqual(at(diffSchemas({ multipleOf: 2 }, {}), '/multipleOf')?.kind, 'non-breaking');
  });
  test('pattern added is breaking, removed is non-breaking', () => {
    assert.strictEqual(at(diffSchemas({}, { pattern: '^x' }), '/pattern')?.kind, 'breaking');
    assert.strictEqual(at(diffSchemas({ pattern: '^x' }, {}), '/pattern')?.kind, 'non-breaking');
  });
  test('uniqueItems enabled is breaking', () => {
    assert.strictEqual(at(diffSchemas({}, { uniqueItems: true }), '/uniqueItems')?.kind, 'breaking');
    assert.strictEqual(at(diffSchemas({ uniqueItems: true }, { uniqueItems: false }), '/uniqueItems')?.kind, 'non-breaking');
  });
  test('maximum raised is non-breaking; bound removed is non-breaking', () => {
    assert.strictEqual(at(diffSchemas({ maximum: 5 }, { maximum: 9 }), '/maximum')?.kind, 'non-breaking');
    assert.strictEqual(at(diffSchemas({ minimum: 3 }, {}), '/minimum')?.kind, 'non-breaking');
  });
  test('oneOf/anyOf branch removed is breaking; added is non-breaking; same-length changed is unclassified', () => {
    assert.strictEqual(at(diffSchemas({ oneOf: [{}, {}] }, { oneOf: [{}] }), '/oneOf')?.kind, 'breaking');
    assert.strictEqual(at(diffSchemas({ anyOf: [{}] }, { anyOf: [{}, {}] }), '/anyOf')?.kind, 'non-breaking');
    assert.strictEqual(at(diffSchemas({ oneOf: [{ type: 'string' }] }, { oneOf: [{ type: 'number' }] }), '/oneOf')?.kind, 'unclassified');
  });
  test('allOf branch removed is non-breaking; same-length changed is unclassified', () => {
    assert.strictEqual(at(diffSchemas({ allOf: [{}, {}] }, { allOf: [{}] }), '/allOf')?.kind, 'non-breaking');
    assert.strictEqual(at(diffSchemas({ allOf: [{ type: 'string' }] }, { allOf: [{ type: 'number' }] }), '/allOf')?.kind, 'unclassified');
  });
  test('recurses into a schema-valued keyword (items) and $defs map', () => {
    assert.strictEqual(at(diffSchemas({ items: { minimum: 0 } }, { items: { minimum: 5 } }), '/items/minimum')?.kind, 'breaking');
    assert.strictEqual(at(diffSchemas({ $defs: { a: {} } }, { $defs: {} }), '/$defs/a')?.kind, 'non-breaking');
  });
  test('additionalItems true → false is breaking', () => {
    assert.strictEqual(at(diffSchemas({ additionalItems: true }, { additionalItems: false }), '/additionalItems')?.kind, 'breaking');
  });
  test('object-valued additionalProperties recurses', () => {
    const e = diffSchemas({ additionalProperties: { type: 'string' } }, { additionalProperties: { type: 'string', minLength: 3 } });
    assert.strictEqual(at(e, '/additionalProperties/minLength')?.kind, 'breaking');
  });
});

suite('[F15-FR-09][F15-FR-10] reporting', () => {
  test('summarise / summaryLine count by kind', () => {
    const e = diffSchemas({ required: ['a'], minimum: 0 }, { required: ['a', 'b'], minimum: 0, title: 'x' });
    const c = summarise(e);
    assert.strictEqual(c.breaking, 1);
    assert.match(summaryLine(e), /1 breaking/);
  });
  test('renderReport groups by severity with pointer paths and old → new', () => {
    const e = diffSchemas({ required: ['a'] }, { required: ['a', 'b'], description: 'hi' });
    const md = renderReport(e, 'a.json vs HEAD');
    assert.match(md, /## Breaking/);
    assert.match(md, /## Informational/);
    assert.match(md, /`\/required`/);
    assert.match(md, /→/);
  });
});

suite('[F15-NFR-01][F15-NFR-02] diffSchemas() — property: never throws', () => {
  test('arbitrary JSON pairs classify or report, never throw', () => {
    const json = fc.jsonValue();
    fc.assert(
      fc.property(json, json, (a, b) => {
        const e = diffSchemas(a, b);
        return Array.isArray(e) && e.every(x => typeof x.path === 'string');
      }),
      { numRuns: 200 },
    );
  });
});
