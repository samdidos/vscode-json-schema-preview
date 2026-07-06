import * as assert from 'assert';
import * as fc from 'fast-check';
import { generateSample, generateAndValidate } from '../../sampleDataGenerator';

suite('[F16-FR-03] generateSample() — value selection priority', () => {
  test('const wins over everything', () => {
    assert.strictEqual(generateSample({ const: 42, default: 1, enum: [2], type: 'number' }), 42);
  });
  test('examples[0] wins over default and enum', () => {
    assert.strictEqual(generateSample({ examples: ['ex'], default: 'def', type: 'string' }), 'ex');
  });
  test('default wins over enum', () => {
    assert.strictEqual(generateSample({ default: 'def', enum: ['a', 'b'], type: 'string' }), 'def');
  });
  test('first enum entry is used when nothing else applies', () => {
    assert.strictEqual(generateSample({ enum: ['a', 'b'] }), 'a');
  });
});

suite('[F16-FR-04] generateSample() — type-derived values honour constraints', () => {
  test('string default is "string"', () => {
    assert.strictEqual(generateSample({ type: 'string' }), 'string');
  });
  test('string minLength is padded, maxLength truncated', () => {
    assert.ok((generateSample({ type: 'string', minLength: 10 }) as string).length >= 10);
    assert.ok((generateSample({ type: 'string', maxLength: 3 }) as string).length <= 3);
  });
  test('format samples are emitted', () => {
    assert.strictEqual(generateSample({ type: 'string', format: 'email' }), 'user@example.com');
    assert.strictEqual(generateSample({ type: 'string', format: 'date' }), '2020-01-01');
    assert.strictEqual(generateSample({ type: 'string', format: 'uuid' }), '00000000-0000-0000-0000-000000000000');
  });
  test('numeric minimum and multipleOf are respected', () => {
    assert.strictEqual(generateSample({ type: 'number', minimum: 5 }), 5);
    assert.strictEqual(generateSample({ type: 'integer', minimum: 7, multipleOf: 5 }), 10);
  });
  test('array generates max(minItems,1) items of the item type', () => {
    assert.deepStrictEqual(generateSample({ type: 'array', items: { type: 'number' } }), [0]);
    const three = generateSample({ type: 'array', minItems: 3, items: { type: 'boolean' } }) as unknown[];
    assert.strictEqual(three.length, 3);
  });
  test('tuple items generate one value per position', () => {
    assert.deepStrictEqual(
      generateSample({ type: 'array', items: [{ type: 'string' }, { type: 'number' }] }),
      ['string', 0],
    );
  });
  test('object includes required always and optional only to meet minProperties', () => {
    const out = generateSample({
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' }, opt: { type: 'number' } },
    }) as Record<string, unknown>;
    assert.ok('id' in out);
    assert.ok(!('opt' in out), 'optional prop omitted when minProperties is 0');
  });
  test('object adds optional properties to satisfy minProperties', () => {
    const out = generateSample({
      type: 'object',
      minProperties: 2,
      properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
    }) as Record<string, unknown>;
    assert.ok(Object.keys(out).length >= 2);
  });
});

suite('[F16-FR-05] generateSample() — composition', () => {
  test('allOf merges properties from every member', () => {
    const out = generateSample({
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
      ],
    }) as Record<string, unknown>;
    assert.deepStrictEqual(out, { a: 'string', b: 0 });
  });
  test('oneOf uses the first branch', () => {
    assert.strictEqual(generateSample({ oneOf: [{ type: 'string' }, { type: 'number' }] }), 'string');
  });
  test('anyOf uses the first branch', () => {
    assert.strictEqual(generateSample({ anyOf: [{ type: 'number' }, { type: 'string' }] }), 0);
  });
});

suite('[F16-FR-06][F16-FR-07] generateSample() — refs and recursion', () => {
  test('resolves a $ref via the resolver', () => {
    const out = generateSample(
      { $ref: '#/$defs/id' },
      { resolveRef: () => ({ type: 'string' }) },
    );
    assert.strictEqual(out, 'string');
  });
  test('an unresolved $ref yields null rather than throwing', () => {
    assert.strictEqual(generateSample({ $ref: '#/nope' }), null);
  });
  test('[F16-FR-07] recursive schema terminates within the depth cap', () => {
    const person: Record<string, unknown> = {
      type: 'object',
      required: ['children'],
      properties: { children: { type: 'array', items: { $ref: '#/$defs/person' } } },
    };
    const resolveRef = () => person;
    assert.doesNotThrow(() => generateSample(person, { resolveRef, maxDepth: 3 }));
  });
});

suite('[F16-FR-09] generateSample() — determinism', () => {
  test('repeated generation is byte-identical', () => {
    const schema = {
      type: 'object',
      required: ['a', 'b'],
      properties: { a: { type: 'string' }, b: { type: 'array', items: { type: 'number' }, minItems: 2 } },
    };
    assert.strictEqual(
      JSON.stringify(generateSample(schema)),
      JSON.stringify(generateSample(schema)),
    );
  });
});

suite('[F16-FR-08] generateAndValidate()', () => {
  test('returns ok with a value that validates', () => {
    const res = generateAndValidate({
      type: 'object',
      required: ['name', 'email'],
      properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, age: { type: 'integer', default: 30 } },
    });
    assert.ok(res.ok);
  });
  test('reports an unsatisfiable string constraint instead of emitting invalid data', () => {
    const res = generateAndValidate({ type: 'string', minLength: 5, maxLength: 2 });
    assert.ok(!res.ok);
    assert.ok((res as { errors: string[] }).errors.length > 0);
  });
  test('reports a schema that fails to compile', () => {
    const res = generateAndValidate({ type: 'object', properties: { a: { type: 'not-a-type' } } });
    assert.ok(!res.ok);
  });

  test('[F16-NFR-02] property: output validates or generation reports an error, never throws', function () {
    // Ajv.compile per run is costly under coverage instrumentation; keep runs
    // modest and give the case headroom over the default 2 s mocha timeout.
    this.timeout(15000);
    const leaf = fc.constantFrom(
      { type: 'string' },
      { type: 'integer' },
      { type: 'number', minimum: 3 },
      { type: 'boolean' },
      { type: 'string', enum: ['x', 'y'] },
      { type: 'string', format: 'date-time' },
    );
    const objSchema = fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), leaf, { maxKeys: 4 }).map(
      properties => ({ type: 'object', properties }),
    );
    fc.assert(
      fc.property(objSchema, schema => {
        const res = generateAndValidate(schema);
        // Either it produced a valid instance, or it cleanly reported errors.
        return res.ok === true || Array.isArray((res as { errors: string[] }).errors);
      }),
      { numRuns: 60 },
    );
  });
});
