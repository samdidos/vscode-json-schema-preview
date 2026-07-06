import * as assert from 'assert';
import {
  JSON_LANGS, YAML_LANGS, TOML_LANGS, ALL_LANGS,
  isYaml, isToml, isSupported,
  stripJsoncComments, parseJsonl, parseToml,
} from '../../languages';

suite('language constants', () => {
  test('JSON_LANGS contains json, jsonc, jsonl', () => {
    assert.deepStrictEqual([...JSON_LANGS], ['json', 'jsonc', 'jsonl']);
  });

  test('YAML_LANGS contains yaml, yml', () => {
    assert.deepStrictEqual([...YAML_LANGS], ['yaml', 'yml']);
  });

  test('[F11-FR-02] TOML_LANGS contains toml', () => {
    assert.deepStrictEqual([...TOML_LANGS], ['toml']);
  });

  test('[F11-FR-02] ALL_LANGS is the union of JSON, YAML and TOML', () => {
    assert.deepStrictEqual([...ALL_LANGS], ['json', 'jsonc', 'jsonl', 'yaml', 'yml', 'toml']);
  });
});

suite('[F11-FR-03] isToml()', () => {
  test('returns true for toml', () => assert.ok(isToml('toml')));
  test('returns false for json / yaml / empty', () => {
    assert.ok(!isToml('json'));
    assert.ok(!isToml('yaml'));
    assert.ok(!isToml(''));
  });
});

suite('[F11-FR-04][F11-NFR-01][F11-NFR-03] parseToml()', () => {
  test('parses scalars, tables and arrays into a JSON-compatible tree', () => {
    const out = parseToml('title = "cfg"\nn = 5\nflag = true\n[server]\nhost = "localhost"\nports = [80, 443]');
    assert.deepStrictEqual(out, {
      title: 'cfg', n: 5, flag: true,
      server: { host: 'localhost', ports: [80, 443] },
    });
  });

  test('[F11-FR-10] normalises native date/time values to ISO-8601 strings', () => {
    const out = parseToml('created = 2020-01-02T03:04:05Z\nday = 2021-06-07') as Record<string, unknown>;
    assert.strictEqual(typeof out.created, 'string');
    assert.match(out.created as string, /^2020-01-02T03:04:05/);
    assert.strictEqual(typeof out.day, 'string');
  });

  test('[F11-FR-10] normalises dates nested inside tables and arrays', () => {
    const out = parseToml('[[events]]\nat = 2020-01-01T00:00:00Z') as { events: Array<{ at: unknown }> };
    assert.strictEqual(typeof out.events[0].at, 'string');
  });

  test('[F11-FR-04] throws on invalid TOML', () => {
    assert.throws(() => parseToml('this is = = not valid'));
  });
});

suite('isYaml()', () => {
  test('returns true for yaml', () => assert.ok(isYaml('yaml')));
  test('returns true for yml', () => assert.ok(isYaml('yml')));
  test('returns false for json', () => assert.ok(!isYaml('json')));
  test('returns false for jsonc', () => assert.ok(!isYaml('jsonc')));
  test('returns false for empty string', () => assert.ok(!isYaml('')));
});

suite('isSupported()', () => {
  test('returns true for all supported IDs', () => {
    for (const id of ['json', 'jsonc', 'jsonl', 'yaml', 'yml', 'toml']) {
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
