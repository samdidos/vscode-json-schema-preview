import * as assert from 'assert';
import { truncateMiddle, MAX_LABEL } from '../../statusBarFormat';

suite('[F04-FR-06] truncateMiddle()', () => {
  test('returns short text unchanged', () => {
    assert.strictEqual(truncateMiddle('schema.json'), 'schema.json');
  });

  test('returns text of exactly max length unchanged', () => {
    const s = 'x'.repeat(MAX_LABEL);
    assert.strictEqual(truncateMiddle(s), s);
  });

  test('middle-truncates long text to the max length with an ellipsis', () => {
    const s = 'a-really-long-schema-name-that-exceeds-the-limit.schema.json';
    const out = truncateMiddle(s);
    assert.strictEqual(out.length, MAX_LABEL);
    assert.ok(out.includes('…'));
    // keeps a legible head and tail (start of the name, end/extension)
    assert.ok(out.startsWith('a-really-long'));
    assert.ok(out.endsWith('.json'));
  });

  test('honours a custom max', () => {
    assert.strictEqual(truncateMiddle('abcdefghij', 5).length, 5);
    assert.ok(truncateMiddle('abcdefghij', 5).includes('…'));
  });

  test('degrades gracefully for tiny maxes', () => {
    assert.strictEqual(truncateMiddle('abcdef', 1), 'a');
    assert.strictEqual(truncateMiddle('abcdef', 0), '');
  });
});
