import * as assert from 'assert';
import {
  JSON_LANGS, YAML_LANGS, ALL_LANGS,
  isYaml, isJsonLike, isSupported,
  stripJsoncComments, parseJsonl,
} from '../../languages';

suite('language constants', () => {
  test('JSON_LANGS contains json, jsonc, jsonl', () => {
    assert.deepStrictEqual([...JSON_LANGS], ['json', 'jsonc', 'jsonl']);
  });

  test('YAML_LANGS contains yaml, yml', () => {
    assert.deepStrictEqual([...YAML_LANGS], ['yaml', 'yml']);
  });

  test('ALL_LANGS is union of JSON and YAML', () => {
    assert.deepStrictEqual([...ALL_LANGS], ['json', 'jsonc', 'jsonl', 'yaml', 'yml']);
  });
});

suite('isYaml()', () => {
  test('returns true for yaml', () => assert.ok(isYaml('yaml')));
  test('returns true for yml', () => assert.ok(isYaml('yml')));
  test('returns false for json', () => assert.ok(!isYaml('json')));
  test('returns false for jsonc', () => assert.ok(!isYaml('jsonc')));
  test('returns false for empty string', () => assert.ok(!isYaml('')));
});

suite('isJsonLike()', () => {
  test('returns true for json', () => assert.ok(isJsonLike('json')));
  test('returns true for jsonc', () => assert.ok(isJsonLike('jsonc')));
  test('returns true for jsonl', () => assert.ok(isJsonLike('jsonl')));
  test('returns false for yaml', () => assert.ok(!isJsonLike('yaml')));
  test('returns false for yml', () => assert.ok(!isJsonLike('yml')));
  test('returns false for plaintext', () => assert.ok(!isJsonLike('plaintext')));
});

suite('isSupported()', () => {
  test('returns true for all supported IDs', () => {
    for (const id of ['json', 'jsonc', 'jsonl', 'yaml', 'yml']) {
      assert.ok(isSupported(id), `expected ${id} to be supported`);
    }
  });
  test('returns false for typescript', () => assert.ok(!isSupported('typescript')));
  test('returns false for plaintext', () => assert.ok(!isSupported('plaintext')));
  test('returns false for empty string', () => assert.ok(!isSupported('')));
});

suite('stripJsoncComments()', () => {
  test('removes line comment', () => {
    assert.strictEqual(stripJsoncComments('{"a":1}// comment'), '{"a":1}');
  });

  test('removes block comment', () => {
    assert.strictEqual(stripJsoncComments('{"a":/* comment */1}'), '{"a":1}');
  });

  test('preserves string containing //', () => {
    assert.strictEqual(stripJsoncComments('{"url":"https://example.com"}'), '{"url":"https://example.com"}');
  });

  test('preserves string containing block comment markers', () => {
    assert.strictEqual(stripJsoncComments('{"k":"/* not a comment */"}'), '{"k":"/* not a comment */"}');
  });

  test('removes trailing line comment leaving valid JSON', () => {
    const input = '{\n  "x": 1 // trailing\n}';
    const result = stripJsoncComments(input);
    assert.doesNotThrow(() => JSON.parse(result));
    assert.strictEqual(JSON.parse(result).x, 1);
  });

  test('multiline block comment', () => {
    const input = '{"a": /* multi\nline */ 42}';
    assert.strictEqual(stripJsoncComments(input), '{"a":  42}');
  });

  test('no-op on plain JSON', () => {
    const json = '{"hello":"world","n":42}';
    assert.strictEqual(stripJsoncComments(json), json);
  });
});

suite('parseJsonl()', () => {
  test('parses two lines', () => {
    assert.deepStrictEqual(parseJsonl('{"a":1}\n{"b":2}'), [{ a: 1 }, { b: 2 }]);
  });

  test('skips blank lines', () => {
    assert.deepStrictEqual(parseJsonl('{"a":1}\n\n{"b":2}'), [{ a: 1 }, { b: 2 }]);
  });

  test('skips comment lines starting with //', () => {
    assert.deepStrictEqual(parseJsonl('// comment\n{"a":1}'), [{ a: 1 }]);
  });

  test('handles single line', () => {
    assert.deepStrictEqual(parseJsonl('"hello"'), ['hello']);
  });

  test('empty string returns empty array', () => {
    assert.deepStrictEqual(parseJsonl(''), []);
  });

  test('only blank lines returns empty array', () => {
    assert.deepStrictEqual(parseJsonl('  \n  \n'), []);
  });
});
