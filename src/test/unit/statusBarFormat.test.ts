import * as assert from 'assert';
import { truncateMiddle, stripSchemaSuffix, schemaLabel, MAX_LABEL } from '../../statusBarFormat';

suite('[F04-FR-06] stripSchemaSuffix()', () => {
  test('drops the extensions every schema shares', () => {
    assert.strictEqual(stripSchemaSuffix('order-request.schema.json'), 'order-request');
    assert.strictEqual(stripSchemaSuffix('person.schema.yaml'), 'person');
    assert.strictEqual(stripSchemaSuffix('person.schema.yml'), 'person');
    assert.strictEqual(stripSchemaSuffix('config.json'), 'config');
    assert.strictEqual(stripSchemaSuffix('config.yaml'), 'config');
  });

  test('prefers the longest match, so .schema.json is not half-stripped', () => {
    // `.json` also matches; taking it first would leave a stray `.schema`.
    assert.strictEqual(stripSchemaSuffix('order.schema.json'), 'order');
  });

  test('is case-insensitive but preserves the name it keeps', () => {
    assert.strictEqual(stripSchemaSuffix('Order.Schema.JSON'), 'Order');
  });

  test('keeps the name when stripping would leave nothing', () => {
    // A file literally called schema.json must still show something.
    assert.strictEqual(stripSchemaSuffix('schema.json'), 'schema');
    assert.strictEqual(stripSchemaSuffix('.schema.json'), '.schema.json');
    assert.strictEqual(stripSchemaSuffix('.json'), '.json');
  });

  test('leaves an unrecognised extension alone', () => {
    assert.strictEqual(stripSchemaSuffix('openapi.toml'), 'openapi.toml');
    assert.strictEqual(stripSchemaSuffix('noextension'), 'noextension');
  });
});

suite('[F04-FR-06] truncateMiddle()', () => {
  test('returns short text unchanged, including at exactly the limit', () => {
    assert.strictEqual(truncateMiddle('order'), 'order');
    const exact = 'x'.repeat(MAX_LABEL);
    assert.strictEqual(truncateMiddle(exact), exact);
  });

  test('never exceeds the limit', () => {
    const out = truncateMiddle('a'.repeat(MAX_LABEL * 3));
    assert.strictEqual(out.length, MAX_LABEL);
  });

  test('keeps the head and the tail around one ellipsis', () => {
    // Start-truncation would drop `order-`, which is the distinguishing half
    // once the shared extension is gone.
    const out = truncateMiddle('order-request-payload', 12);
    assert.strictEqual(out.length, 12);
    assert.ok(out.startsWith('order'), `expected a legible head, got ${out}`);
    assert.ok(out.endsWith('load'), `expected a legible tail, got ${out}`);
    assert.strictEqual((out.match(/…/g) ?? []).length, 1);
  });

  test('degrades sanely at absurd limits', () => {
    assert.strictEqual(truncateMiddle('abcdefghij', 1), 'a');
    assert.strictEqual(truncateMiddle('abcdefghij', 0), '');
  });
});

suite('[F04-FR-06] schemaLabel()', () => {
  test('a typical schema name fits whole, with no ellipsis at all', () => {
    assert.strictEqual(schemaLabel('order-request.schema.json'), 'order-request');
    assert.strictEqual(schemaLabel('person.schema.json'), 'person');
  });

  test('the whole label stays within the budget', () => {
    const long = schemaLabel('a-very-long-internal-service-request.schema.json');
    assert.ok(long.length <= MAX_LABEL, `${long} is ${long.length} chars`);
  });

  test('the (auto) marker counts against the budget rather than escaping it', () => {
    const label = schemaLabel('a-very-long-catalog-entry-name.schema.json', ' (auto)');
    assert.ok(label.endsWith(' (auto)'));
    assert.ok(label.length <= MAX_LABEL, `${label} is ${label.length} chars`);
  });

  test('two schemas differing only at the start stay distinguishable', () => {
    // The reason for middle- rather than start-truncation: these two would be
    // identical under start-truncation once padded past the limit.
    const req = schemaLabel('order-request-envelope-v2.schema.json');
    const res = schemaLabel('order-response-envelope-v2.schema.json');
    assert.notStrictEqual(req, res);
  });
});
