import * as assert from 'assert';
import fc from 'fast-check';
import { createSchema } from 'genson-js';

const {
  detectFormat, detectEnum, enrichInferredSchema,
  ENUM_MIN_OBSERVATIONS, ENUM_MAX_DISTINCT, ENUM_MAX_DISTINCT_RATIO,
} = require('../../inferenceEnrich');

type Schema = Record<string, unknown>;
/** Infer + enrich; for a record array, return the element schema under `items`. */
const infer = (data: unknown): Schema => {
  const enriched = enrichInferredSchema(createSchema(data as object), data) as Schema;
  return Array.isArray(data) ? (enriched.items as Schema) : enriched;
};
const prop = (schema: Schema, name: string): Schema =>
  ((schema.properties as Record<string, Schema>)[name]);

suite('[F06-FR-13] detectFormat() — a format only when every value matches', () => {
  test('recognises each supported format', () => {
    assert.strictEqual(detectFormat(['a@b.co', 'x.y@z.org']), 'email');
    assert.strictEqual(detectFormat(['https://x.test/a', 'http://y.test']), 'uri');
    assert.strictEqual(detectFormat(['2024-01-02T03:04:05Z', '2024-06-07T08:09:10.5+02:00']), 'date-time');
    assert.strictEqual(detectFormat(['2024-01-02', '1999-12-31']), 'date');
    assert.strictEqual(detectFormat(['123e4567-e89b-42d3-a456-426614174000']), 'uuid');
    assert.strictEqual(detectFormat(['10.0.0.1', '255.255.255.255']), 'ipv4');
  });

  test('yields nothing when a single value does not match', () => {
    assert.strictEqual(detectFormat(['a@b.co', 'not-an-email']), undefined);
    assert.strictEqual(detectFormat(['2024-01-02', '2024-13-45']), undefined);
    assert.strictEqual(detectFormat(['10.0.0.1', '999.0.0.1']), undefined);
  });

  test('yields nothing for plain strings or an empty list', () => {
    assert.strictEqual(detectFormat(['Ada', 'Grace']), undefined);
    assert.strictEqual(detectFormat([]), undefined);
  });

  test('prefers date-time over date, and never confuses the two', () => {
    assert.strictEqual(detectFormat(['2024-01-02T00:00:00Z']), 'date-time');
    assert.strictEqual(detectFormat(['2024-01-02T00:00:00Z', '2024-01-03']), undefined);
  });
});

suite('[F06-FR-14] detectEnum() — a closed set only when it repeats', () => {
  test('infers an enum from a small repeating set', () => {
    assert.deepStrictEqual(detectEnum(['a', 'b', 'a', 'b', 'a']), ['a', 'b']);
  });

  test('needs enough observations to trust the set', () => {
    assert.strictEqual(detectEnum(['a', 'b', 'a']), undefined);
    assert.deepStrictEqual(detectEnum(Array(ENUM_MIN_OBSERVATIONS).fill('a')), ['a']);
  });

  test('refuses when values barely repeat', () => {
    // 4 observations, 3 distinct → ratio 0.75, above the threshold.
    assert.ok(3 / 4 > ENUM_MAX_DISTINCT_RATIO, 'the fixture exercises the ratio rule');
    assert.strictEqual(detectEnum(['a', 'b', 'c', 'a']), undefined);
    // 4 observations, 2 distinct → ratio 0.5, exactly at the threshold.
    assert.ok(2 / 4 <= ENUM_MAX_DISTINCT_RATIO);
    assert.deepStrictEqual(detectEnum(['a', 'b', 'a', 'b']), ['a', 'b']);
  });

  test('refuses a set that is too large to be a contract', () => {
    const values = Array.from({ length: (ENUM_MAX_DISTINCT + 1) * 3 }, (_, i) => `v${i % (ENUM_MAX_DISTINCT + 1)}`);
    assert.strictEqual(detectEnum(values), undefined);
  });

  test('refuses a set containing a blank value', () => {
    assert.strictEqual(detectEnum(['a', '', 'a', '']), undefined);
  });

  test('returns the distinct values sorted, for a stable schema', () => {
    assert.deepStrictEqual(detectEnum(['z', 'a', 'z', 'a']), ['a', 'z']);
  });
});

suite('[F06-FR-13] enrichInferredSchema() — formats on inferred properties', () => {
  test('adds a format to a string property whose values all match', () => {
    const records = [{ email: 'a@b.co' }, { email: 'c@d.org' }];
    assert.strictEqual(prop(infer(records), 'email').format, 'email');
  });

  test('adds a format from a single document too', () => {
    assert.strictEqual(prop(infer({ when: '2024-01-02T00:00:00Z' }), 'when').format, 'date-time');
  });

  test('leaves a mixed-value property untouched', () => {
    const records = [{ id: '123e4567-e89b-42d3-a456-426614174000' }, { id: 'legacy-7' }];
    assert.strictEqual(prop(infer(records), 'id').format, undefined);
  });

  test('reaches nested objects and array elements', () => {
    const records = [
      { contact: { email: 'a@b.co' }, tags: [{ url: 'https://x.test' }] },
      { contact: { email: 'c@d.org' }, tags: [{ url: 'https://y.test' }] },
    ];
    const schema = infer(records);
    assert.strictEqual(prop(prop(schema, 'contact'), 'email').format, 'email');
    const items = prop(schema, 'tags').items as Schema;
    assert.strictEqual(prop(items, 'url').format, 'uri');
  });

  test('does not touch a property that is not always a string', () => {
    const records = [{ v: 'a@b.co' }, { v: 7 }];
    assert.strictEqual(prop(infer(records), 'v').format, undefined);
  });
});

suite('[F06-FR-14] enrichInferredSchema() — enums on inferred properties', () => {
  test('infers an enum from a repeating field across records', () => {
    const records = ['admin', 'editor', 'admin', 'viewer', 'admin', 'editor'].map(role => ({ role }));
    assert.deepStrictEqual(prop(infer(records), 'role').enum, ['admin', 'editor', 'viewer']);
  });

  test('never infers an enum from a single document', () => {
    assert.strictEqual(prop(infer({ role: 'admin' }), 'role').enum, undefined);
  });

  test('does not add an enum where a format already applies', () => {
    const records = Array(6).fill({ email: 'a@b.co' });
    const email = prop(infer(records), 'email');
    assert.strictEqual(email.format, 'email');
    assert.strictEqual(email.enum, undefined);
  });

  test('leaves a high-cardinality field alone', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ name: `user-${i}` }));
    assert.strictEqual(prop(infer(records), 'name').enum, undefined);
  });
});

suite('[F06-FR-15] enrichInferredSchema() — additive, pure, total', () => {
  test('never removes, renames or retypes what the structural pass produced', () => {
    fc.assert(
      fc.property(fc.array(fc.jsonValue(), { minLength: 1, maxLength: 6 }), data => {
        let structural: unknown;
        try { structural = createSchema(data as object); } catch { return true; }
        const enriched = enrichInferredSchema(structural, data);
        return JSON.stringify(strip(enriched)) === JSON.stringify(strip(structural));
      }),
      { numRuns: 200 },
    );
  });

  test('is deterministic for identical input', () => {
    const records = [{ a: 'x@y.z', r: 'a' }, { a: 'p@q.r', r: 'a' }, { a: 'm@n.o', r: 'b' }, { a: 'j@k.l', r: 'a' }];
    assert.deepStrictEqual(infer(records), infer(records));
  });

  test('returns the input unchanged when it is not a schema object', () => {
    assert.strictEqual(enrichInferredSchema(null, {}), null);
    assert.strictEqual(enrichInferredSchema(42, {}), 42);
  });

  test('does not mutate the schema it is given', () => {
    const structural = createSchema({ email: 'a@b.co' }) as Schema;
    const before = JSON.stringify(structural);
    enrichInferredSchema(structural, { email: 'a@b.co' });
    assert.strictEqual(JSON.stringify(structural), before);
  });

  test('never throws for arbitrary schema/data pairs', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (schema, data) => {
        enrichInferredSchema(schema, data);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

/** Drop the keys enrichment may add, to compare structure only. */
function strip(value: unknown): unknown {
  if (Array.isArray(value)) { return value.map(strip); }
  if (!value || typeof value !== 'object') { return value; }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'format' || k === 'enum') { continue; }
    out[k] = strip(v);
  }
  return out;
}
