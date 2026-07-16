import * as assert from 'assert';
import { truncateStart, MAX_LABEL } from '../../statusBarFormat';

suite('[F04-FR-06] truncateStart()', () => {
  test('returns short text unchanged', () => {
    assert.strictEqual(truncateStart('schema.json'), 'schema.json');
  });

  test('returns text of exactly max length unchanged', () => {
    const s = 'x'.repeat(MAX_LABEL);
    assert.strictEqual(truncateStart(s), s);
  });

  test('start-truncates long text to the max length with a leading ellipsis', () => {
    const s = 'a-really-long-schema-name-that-exceeds-the-limit.schema.json';
    const out = truncateStart(s);
    assert.strictEqual(out.length, MAX_LABEL);
    assert.ok(out.startsWith('…'));
    // elides the beginning but keeps the legible end (extension intact)
    assert.ok(!out.includes('a-really-long'));
    assert.ok(out.endsWith('.schema.json'));
  });

  test('honours a custom max', () => {
    assert.strictEqual(truncateStart('abcdefghij', 5).length, 5);
    assert.ok(truncateStart('abcdefghij', 5).startsWith('…'));
    assert.strictEqual(truncateStart('abcdefghij', 5), '…ghij');
  });

  test('degrades gracefully for tiny maxes', () => {
    assert.strictEqual(truncateStart('abcdef', 1), 'f');
    assert.strictEqual(truncateStart('abcdef', 0), '');
  });
});
