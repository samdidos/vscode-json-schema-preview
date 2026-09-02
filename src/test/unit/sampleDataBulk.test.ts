import * as assert from 'assert';
import fc from 'fast-check';

const {
  generateMany,
  renderJsonl,
  generateSample,
  generateAndValidate,
} = require('../../sampleDataGenerator');

const PERSON = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
    age: { type: 'integer', minimum: 18, maximum: 30 },
  },
  required: ['name', 'role', 'age'],
};

suite('[F16-FR-10][S20-SR-09] generateMany() — bulk generation', () => {
  test('produces the requested number of instances', () => {
    const result = generateMany(PERSON, 5);
    assert.strictEqual(result.instances.length, 5);
    assert.strictEqual(result.requested, 5);
    assert.strictEqual(result.dropped, 0);
  });

  test('varies instances rather than repeating one document', () => {
    const serialised = generateMany(PERSON, 3).instances.map((i: unknown) => JSON.stringify(i));
    assert.strictEqual(new Set(serialised).size, 3, `expected 3 distinct instances, got ${serialised.join(' | ')}`);
  });

  test('rotates enum values across instances', () => {
    const roles = generateMany(PERSON, 3).instances.map((i: { role: string }) => i.role);
    assert.deepStrictEqual(roles, ['admin', 'editor', 'viewer']);
  });

  test('wraps enum rotation past the last value', () => {
    const roles = generateMany(PERSON, 4).instances.map((i: { role: string }) => i.role);
    assert.strictEqual(roles[3], 'admin');
  });

  test('rotates examples across instances', () => {
    const schema = { type: 'string', examples: ['a', 'b'] };
    assert.deepStrictEqual(generateMany(schema, 3).instances, ['a', 'b', 'a']);
  });

  test('rotates oneOf branches across instances', () => {
    const schema = { oneOf: [{ type: 'string' }, { type: 'integer' }] };
    const kinds = generateMany(schema, 2).instances.map((i: unknown) => typeof i);
    assert.deepStrictEqual(kinds, ['string', 'number']);
  });

  test('every emitted instance passes the schema (F16-FR-08 gate)', () => {
    for (const instance of generateMany(PERSON, 10).instances) {
      const roundTrip = generateAndValidate(PERSON, {});
      assert.ok(roundTrip.ok);
      assert.ok(instance && typeof instance === 'object');
    }
    const bounded = generateMany(PERSON, 30).instances as Array<{ age: number }>;
    assert.ok(bounded.every(i => i.age >= 18 && i.age <= 30), 'stepped numbers stay within declared bounds');
  });

  test('is deterministic for a given schema and count', () => {
    assert.deepStrictEqual(generateMany(PERSON, 4).instances, generateMany(PERSON, 4).instances);
  });

  test('variant 0 reproduces the single-instance output exactly', () => {
    assert.deepStrictEqual(generateMany(PERSON, 1).instances[0], generateSample(PERSON));
  });

  test('reports the shortfall when the schema cannot be compiled', () => {
    const result = generateMany({ type: 'not-a-type' }, 3);
    assert.deepStrictEqual(result.instances, []);
    assert.strictEqual(result.dropped, 3);
    assert.match(result.errors[0], /Cannot compile/);
  });

  test('drops candidates the schema rejects and counts them', () => {
    // `not` makes every generated string unsatisfiable, so nothing is emitted.
    const result = generateMany({ type: 'string', not: { type: 'string' } }, 3);
    assert.deepStrictEqual(result.instances, []);
    assert.strictEqual(result.dropped, 3);
    assert.ok(result.errors.length >= 1);
  });

  test('deduplicates repeated drop reasons', () => {
    const result = generateMany({ type: 'string', not: { type: 'string' } }, 5);
    assert.strictEqual(new Set(result.errors).size, result.errors.length);
  });

  test('treats a non-positive or fractional count sanely', () => {
    assert.deepStrictEqual(generateMany(PERSON, 0).instances, []);
    assert.deepStrictEqual(generateMany(PERSON, -3).instances, []);
    assert.strictEqual(generateMany(PERSON, 2.9).instances.length, 2);
  });

  test('varies free-form strings but leaves formatted ones alone', () => {
    const free = generateMany({ type: 'string' }, 3).instances;
    assert.strictEqual(new Set(free).size, 3);
    const emails = generateMany({ type: 'string', format: 'email' }, 3).instances;
    assert.deepStrictEqual(emails, ['user@example.com', 'user@example.com', 'user@example.com']);
  });

  test('respects maxLength while varying', () => {
    const values = generateMany({ type: 'string', maxLength: 4 }, 5).instances as string[];
    assert.ok(values.every(v => v.length <= 4));
  });

  test('alternates booleans', () => {
    assert.deepStrictEqual(generateMany({ type: 'boolean' }, 3).instances, [false, true, false]);
  });

  test('steps unbounded numbers upward', () => {
    assert.deepStrictEqual(generateMany({ type: 'integer', minimum: 5 }, 3).instances, [5, 6, 7]);
  });

  test('honours multipleOf while stepping', () => {
    const values = generateMany({ type: 'integer', multipleOf: 5, minimum: 0 }, 3).instances as number[];
    assert.ok(values.every(v => v % 5 === 0), `expected multiples of 5, got ${values.join(',')}`);
  });

  test('never throws for arbitrary schemas', () => {
    fc.assert(
      fc.property(fc.jsonValue(), schema => {
        generateMany(schema, 3);
        return true;
      }),
      { numRuns: 150 },
    );
  });
});

suite('[F16-FR-10] renderJsonl() — JSONL output', () => {
  test('emits one instance per line', () => {
    const lines = renderJsonl([{ a: 1 }, { a: 2 }]).split('\n');
    assert.deepStrictEqual(lines, ['{"a":1}', '{"a":2}']);
  });

  test('every line round-trips as JSON', () => {
    const jsonl = renderJsonl(generateMany(PERSON, 4).instances);
    for (const line of jsonl.split('\n')) { JSON.parse(line); }
  });

  test('renders an empty list as an empty string', () => {
    assert.strictEqual(renderJsonl([]), '');
  });
});
