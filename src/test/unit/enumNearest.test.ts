import * as assert from 'assert';

const { levenshtein, rankEnumCandidates, buildFixes } = require('../../validationFix');

const ENUM = ['development', 'staging', 'production'];
const enumError = (allowedValues: unknown[]) => ({
  keyword: 'enum',
  instancePath: '/env',
  params: { allowedValues },
});

suite('[F25-FR-02] levenshtein()', () => {
  test('is zero for equal strings and symmetric', () => {
    assert.strictEqual(levenshtein('prod', 'prod'), 0);
    assert.strictEqual(levenshtein('prod', 'production'), levenshtein('production', 'prod'));
  });

  test('counts single edits', () => {
    assert.strictEqual(levenshtein('prod', 'prad'), 1); // substitution
    assert.strictEqual(levenshtein('prod', 'pro'), 1); // deletion
    assert.strictEqual(levenshtein('', 'abc'), 3);
  });
});

suite('[F25-FR-01][F25-FR-03] rankEnumCandidates()', () => {
  test('orders by nearest and marks a near-miss preferred', () => {
    const ranked = rankEnumCandidates('prod', ENUM);
    assert.strictEqual(ranked[0].value, 'production');
    assert.ok(ranked[0].closest);
    assert.ok(ranked[0].preferred, '"prod"→"production" is a near-miss');
    assert.ok(!ranked[1].closest);
  });

  test('treats a case-only difference as preferred (distance 0)', () => {
    const ranked = rankEnumCandidates('PRODUCTION', ENUM);
    assert.strictEqual(ranked[0].value, 'production');
    assert.ok(ranked[0].preferred);
  });

  test('offers a distant closest first but does not mark it preferred', () => {
    const ranked = rankEnumCandidates('zzzzz', ENUM);
    assert.ok(ranked[0].closest);
    assert.ok(!ranked[0].preferred, 'too distant to auto-apply');
  });

  test('keeps schema order and never throws for non-string values', () => {
    const nums = [1, 2, 3];
    const ranked = rankEnumCandidates(2, nums);
    assert.deepStrictEqual(ranked.map((r: any) => r.value), nums);
    assert.ok(ranked.every((r: any) => !r.preferred && !r.closest));
    assert.doesNotThrow(() => rankEnumCandidates(undefined, [null, 1, 'x']));
  });

  test('uses case-sensitive distance to break ties', () => {
    // Both differ from "Ab" by one case-insensitive edit; the exact-case match wins.
    const ranked = rankEnumCandidates('ab', ['aB', 'ab']);
    assert.strictEqual(ranked[0].value, 'ab');
  });
});

suite('[F25-FR-01][F25-FR-03] buildFixes() — enum ordering', () => {
  test('offers the closest match first, labelled and preferred', () => {
    const fixes = buildFixes([enumError(ENUM)], {}, { env: 'prod' });
    assert.strictEqual(fixes[0].value, 'production');
    assert.match(fixes[0].title, /Change to "production" \(closest match\)/);
    assert.strictEqual(fixes[0].preferred, true);
    // The others are still offered, without the closest-match suffix.
    assert.strictEqual(fixes.length, 3);
    assert.ok(!/closest match/.test(fixes[1].title));
  });

  test('no "(closest match)" suffix when the enum has a single value', () => {
    const fixes = buildFixes([enumError(['only'])], {}, { env: 'onlyy' });
    assert.strictEqual(fixes.length, 1);
    assert.ok(!/closest match/.test(fixes[0].title));
  });

  test('caps at six fixes, keeping the nearest', () => {
    const many = ['aaa', 'aab', 'aac', 'aad', 'aae', 'aaf', 'zzz'];
    const fixes = buildFixes([enumError(many)], {}, { env: 'aaa' });
    assert.strictEqual(fixes.length, 6);
    assert.strictEqual(fixes[0].value, 'aaa');
    assert.ok(!fixes.some((f: any) => f.value === 'zzz'), 'the most distant value is dropped by the cap');
  });
});

suite('[F25-FR-04] buildFixes() — other fix kinds unchanged', () => {
  test('const still yields a single fix with no preferred flag', () => {
    const fixes = buildFixes(
      [{ keyword: 'const', instancePath: '/x', params: { allowedValue: 'fixed' } }],
      {},
      { x: 'other' },
    );
    assert.strictEqual(fixes.length, 1);
    assert.strictEqual(fixes[0].value, 'fixed');
    assert.strictEqual(fixes[0].preferred, undefined);
  });

  test('required fix is unaffected', () => {
    const fixes = buildFixes(
      [{ keyword: 'required', instancePath: '', params: { missingProperty: 'name' } }],
      { properties: { name: { type: 'string' } } },
      {},
    );
    assert.match(fixes[0].title, /Add missing required property "name"/);
    assert.strictEqual(fixes[0].preferred, undefined);
  });
});
