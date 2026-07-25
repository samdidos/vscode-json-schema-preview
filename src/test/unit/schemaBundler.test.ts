import * as assert from 'assert';
import { bundleSchema, dereferenceSchema, deriveKey, type DocResolver } from '../../schemaBundler';

/** Resolver over an in-memory doc map keyed by the raw ref URI (id === uri). */
function resolverFrom(docs: Record<string, unknown>): DocResolver {
  return async (uri: string) => {
    if (!(uri in docs)) { throw new Error(`unresolvable ${uri}`); }
    const stem = uri.split('#')[0].replace(/\.[^.]+$/, '');
    return { id: uri, schema: docs[uri], keyHint: stem };
  };
}

suite('deriveKey()', () => {
  test('prefers $id basename', () => {
    assert.strictEqual(deriveKey({ $id: 'https://x/address.schema.json' }, 'ignored'), 'address_schema');
  });
  test('falls back to the URI filename stem', () => {
    assert.strictEqual(deriveKey({}, './defs/common.json'), 'common');
  });
  test('sanitises to schema when empty', () => {
    assert.strictEqual(deriveKey({}, ''), 'schema');
  });
});

suite('[F14-FR-05][F14-NFR-02] bundleSchema()', () => {
  test('embeds two relative refs under $defs and rewrites them', async () => {
    const root = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'root',
      type: 'object',
      properties: {
        a: { $ref: 'a.json' },
        b: { $ref: 'b.json#/$defs/inner' },
      },
    };
    const docs = {
      'a.json': { type: 'string' },
      'b.json': { $defs: { inner: { type: 'number' } } },
    };
    const { schema } = await bundleSchema(root, resolverFrom(docs)) as any;
    assert.strictEqual(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(schema.$id, 'root');
    assert.strictEqual(schema.properties.a.$ref, '#/$defs/a');
    assert.strictEqual(schema.properties.b.$ref, '#/$defs/b/$defs/inner');
    assert.deepStrictEqual(schema.$defs.a, { type: 'string', $comment: 'Bundled from a.json' });
    assert.deepStrictEqual(schema.$defs.b, {
      $defs: { inner: { type: 'number' } },
      $comment: 'Bundled from b.json',
    });
  });

  test('[F14-FR-10] appends to, rather than overwrites, an existing $comment', async () => {
    const root = { properties: { a: { $ref: 'a.json' } } };
    const docs = { 'a.json': { type: 'string', $comment: 'hand-authored note' } };
    const { schema } = await bundleSchema(root, resolverFrom(docs)) as any;
    assert.strictEqual(schema.$defs.a.$comment, 'hand-authored note — Bundled from a.json');
  });

  test('embeds each distinct document exactly once (dedup)', async () => {
    const root = { properties: { a: { $ref: 'x.json' }, b: { $ref: 'x.json#/foo' } } };
    const docs = { 'x.json': { foo: { type: 'string' } } };
    const { schema } = await bundleSchema(root, resolverFrom(docs)) as any;
    assert.strictEqual(Object.keys(schema.$defs).length, 1);
    assert.strictEqual(schema.properties.a.$ref, '#/$defs/x');
    assert.strictEqual(schema.properties.b.$ref, '#/$defs/x/foo');
  });

  test('rebases internal refs inside an embedded document', async () => {
    const root = { properties: { c: { $ref: 'common.json#/$defs/ref2' } } };
    const docs = {
      'common.json': {
        $defs: { id: { type: 'string' }, ref2: { $ref: '#/$defs/id' } },
      },
    };
    const { schema } = await bundleSchema(root, resolverFrom(docs)) as any;
    assert.strictEqual(schema.$defs.common.$defs.ref2.$ref, '#/$defs/common/$defs/id');
  });

  test('[F14-FR-07] strips nested $id from embedded copies', async () => {
    const root = { properties: { a: { $ref: 'a.json' } } };
    const docs = { 'a.json': { $id: 'https://x/a', type: 'string' } };
    const { schema, strippedIds } = await bundleSchema(root, resolverFrom(docs)) as any;
    assert.ok(!('$id' in schema.$defs.a));
    assert.deepStrictEqual(strippedIds, ['https://x/a']);
  });

  test('leaves the root internal refs unchanged', async () => {
    const root = { $defs: { local: { type: 'string' } }, properties: { a: { $ref: '#/$defs/local' } } };
    const { schema } = await bundleSchema(root, resolverFrom({})) as any;
    assert.strictEqual(schema.properties.a.$ref, '#/$defs/local');
  });

  test('[F14-FR-08] propagates an unresolvable ref error naming it', async () => {
    const root = { properties: { a: { $ref: 'missing.json' } } };
    await assert.rejects(() => bundleSchema(root, resolverFrom({})), /unresolvable missing\.json/);
  });

  test('[F14-NFR-01] aborts past the document cap', async () => {
    const docs: Record<string, unknown> = {};
    const props: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) { docs[`d${i}.json`] = { type: 'string' }; props[`p${i}`] = { $ref: `d${i}.json` }; }
    await assert.rejects(
      () => bundleSchema({ properties: props }, resolverFrom(docs), { maxDocs: 3 }),
      /more than 3 external documents/,
    );
  });
});

suite('[F14-FR-06] dereferenceSchema()', () => {
  test('inlines a simple relative ref', async () => {
    const root = { properties: { a: { $ref: 'a.json#/$defs/id' } } };
    const docs = { 'a.json': { $defs: { id: { type: 'string', description: 'an id' } } } };
    const { schema } = await dereferenceSchema(root, resolverFrom(docs)) as any;
    assert.deepStrictEqual(schema.properties.a, { type: 'string', description: 'an id' });
  });

  test('inlines an internal ref', async () => {
    const root = { $defs: { id: { type: 'integer' } }, properties: { a: { $ref: '#/$defs/id' } } };
    const { schema } = await dereferenceSchema(root, resolverFrom({})) as any;
    assert.deepStrictEqual(schema.properties.a, { type: 'integer' });
  });

  test('[F14-FR-06] a self-referential cycle terminates and is kept as a $defs ref', async () => {
    const root = { type: 'object', properties: { self: { $ref: '#' } } };
    const { schema } = await dereferenceSchema(root, resolverFrom({})) as any;
    // The whole thing resolves without hanging; the cycle survives as a $defs ref.
    const json = JSON.stringify(schema);
    assert.match(json, /"\$ref":"#\/\$defs\//);
    assert.ok(schema.$defs && Object.keys(schema.$defs).length >= 1);
  });

  test('a mutual person→person loop terminates', async () => {
    const root = {
      $defs: { person: { type: 'object', properties: { pal: { $ref: '#/$defs/person' } } } },
      properties: { friend: { $ref: '#/$defs/person' } },
    };
    const { schema } = await dereferenceSchema(root, resolverFrom({})) as any;
    assert.ok(schema.properties.friend.type === 'object');
    assert.match(JSON.stringify(schema), /"\$ref":"#\/\$defs\//);
  });

  test('[F14-FR-07] strips $id from inlined content but keeps the root $id', async () => {
    const root = { $id: 'root', properties: { a: { $ref: 'a.json' } } };
    const docs = { 'a.json': { $id: 'https://x/a', type: 'string' } };
    const { schema, strippedIds } = await dereferenceSchema(root, resolverFrom(docs)) as any;
    assert.strictEqual(schema.$id, 'root');
    assert.ok(!('$id' in schema.properties.a));
    assert.deepStrictEqual(strippedIds, ['https://x/a']);
  });

  test('[F14-FR-08] throws on an unresolvable pointer', async () => {
    const root = { properties: { a: { $ref: '#/$defs/missing' } } };
    await assert.rejects(() => dereferenceSchema(root, resolverFrom({})), /Cannot resolve \$ref/);
  });
});
