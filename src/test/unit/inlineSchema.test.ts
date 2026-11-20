import * as assert from 'assert';
import { inlineSchemaReference } from '../../inlineSchema';

suite('Inline binding source locations [F13-FR-11] [F13-NFR-02]', () => {
  test('YAML decodes quoted values and preserves spaces and source positions', () => {
    for (const text of ['$schema: "./person schema.json"\n', "$schema: './person schema.json'\n", '$schema: ./person schema.json # comment\n']) {
      const result = inlineSchemaReference(text, 'yaml');
      assert.strictEqual(result?.url, './person schema.json');
      const raw = text.startsWith('$schema: "') ? '"./person schema.json"'
        : text.startsWith("$schema: '") ? "'./person schema.json'" : './person schema.json';
      assert.strictEqual(result!.start, text.indexOf(raw));
      assert.strictEqual(result!.end, result!.start + raw.length);
      assert.strictEqual(text.slice(result!.start, result!.end), raw);
    }
  });

  test('JSONC accepts trailing commas but JSON rejects comments and trailing commas', () => {
    const text = '{/* schema */ "$schema": "./person.json",}';
    assert.strictEqual(inlineSchemaReference(text, 'jsonc')?.url, './person.json');
    assert.strictEqual(inlineSchemaReference(text, 'json'), undefined);
    assert.strictEqual(inlineSchemaReference('{"$schema":"./person.json",}', 'json'), undefined);
  });

  test('retains a YAML binding while a later field is being edited', () => {
    assert.strictEqual(inlineSchemaReference('$schema: ./person.json\nbroken: [', 'yaml')?.url,
      './person.json');
  });

  test('JSON uses the active final duplicate key and decodes escaped source characters', () => {
    const text = '{"$schema":"./old.json", "$schema":"./person\\u0020schema.json"}';
    const result = inlineSchemaReference(text, 'json');
    assert.strictEqual(result?.url, './person schema.json');
    assert.ok(result!.start > text.indexOf('./old.json'));
  });

  test('TOML ignores assignments and table headers inside multiline descriptions', () => {
    for (const quote of ['"""', "'''"]) {
      const fake = `description = ${quote}\n[pretend]\n"$schema" = "./fake.json"\n${quote}\n`;
      assert.strictEqual(inlineSchemaReference(fake, 'toml'), undefined);
      const text = fake + '"$schema" = "./real.json"\n';
      const result = inlineSchemaReference(text, 'toml');
      assert.strictEqual(result?.url, './real.json');
      assert.ok(result!.start > text.indexOf('./fake.json'));
    }
  });

  test('TOML locates escaped and literal values, comments and root keys before tables', () => {
    for (const value of ['"./person\\u0020schema.json"', "'./person schema.json'"]) {
      const text = `# "$schema" = "./fake.json"\n  "$schema" = ${value}\n[tool]\n"$schema" = "./nested.json"`;
      const result = inlineSchemaReference(text, 'toml');
      assert.strictEqual(result?.url, './person schema.json');
      assert.ok(text.slice(result!.start, result!.end).startsWith(value));
    }
  });

  test('keeps a valid TOML binding while a later value is incomplete or invalid', () => {
    for (const suffix of ['port = ', 'broken = [', '[tool]\nport = ']) {
      const text = '"$schema" = "./person.json"\n' + suffix;
      assert.strictEqual(inlineSchemaReference(text, 'toml')?.url, './person.json');
    }
  });

  test('a half-edited TOML file never yields a nested or post-error "$schema"', () => {
    for (const text of [
      'port = \n"$schema" = "./late.json"\n',
      '[tool]\n"$schema" = "./nested.json"\nport = \n',
      'a = """\n"$schema" = "./in-string.json"\n',
    ]) {
      assert.strictEqual(inlineSchemaReference(text, 'toml'), undefined, text);
    }
  });

  test('ignores nested bindings, malformed syntax, nonstrings and unsupported formats', () => {
    for (const [text, lang] of [
      ['[tool]\n"$schema" = "./nested.json"', 'toml'],
      ['"$schema" = 42', 'toml'],
      ['"$schema" = "unfinished', 'toml'],
      ['nested:\n  $schema: ./nested.json', 'yaml'],
      ['$schema: 42', 'yaml'],
      ['$schema: [broken', 'yaml'],
      ['["$schema"]', 'json'],
      ['{"$schema": true}', 'jsonc'],
      ['{"$schema": "x"}', 'jsonl'],
    ]) { assert.strictEqual(inlineSchemaReference(text, lang), undefined, text); }
  });

  test('YAML directive precedence applies even after another root key', () => {
    const text = '$schema: https://json-schema.org/draft/2020-12/schema\n# yaml-language-server: $schema=./real.json\n';
    assert.strictEqual(inlineSchemaReference(text, 'yaml')?.url, './real.json');
    assert.strictEqual(inlineSchemaReference(text, 'yaml')?.directive, true);
  });

  test('a YAML directive value ends at the first whitespace, as yaml-language-server reads it', () => {
    const text = '# yaml-language-server: $schema=./s.json # note\nname: x\n';
    const result = inlineSchemaReference(text, 'yaml');
    assert.strictEqual(result?.url, './s.json');
    assert.strictEqual(text.slice(result!.start, result!.end), './s.json');
  });

  test('a YAML directive may list other modeline options before $schema', () => {
    const text = '# yaml-language-server: foo=1 $schema=./s.json\n';
    assert.strictEqual(inlineSchemaReference(text, 'yaml')?.url, './s.json');
  });

  test('TOML reports the whole root statement', () => {
    const text = '# header\n"$schema" = \'./s.json\' # note\ntitle = "x"\n';
    const result = inlineSchemaReference(text, 'toml');
    assert.strictEqual(result?.url, './s.json');
    assert.strictEqual(text.slice(result!.start, result!.end), "'./s.json'");
    assert.strictEqual(text.slice(result!.statement!.start, result!.statement!.end), '"$schema" = \'./s.json\' # note\n');
  });
});

suite('Inline binding extraction cost [F13-NFR-03]', () => {
  test('text without a literal $schema is not a binding in any language', () => {
    assert.strictEqual(inlineSchemaReference('{"\\u0024schema":"./person.json"}', 'json'), undefined);
    assert.strictEqual(inlineSchemaReference('"\\u0024schema" = "./person.json"\n', 'toml'), undefined);
    assert.strictEqual(inlineSchemaReference('"\\x24schema": ./person.json\n', 'yaml'), undefined);
  });

  // The parse this replaces took seconds on a file this size; the budget is
  // F13-NFR-01's 50 ms, far above what a substring scan needs, so the
  // assertion only trips if the full parse comes back.
  test('a ~900 KB YAML file without $schema is answered without parsing it', () => {
    const line = 'service_000000:\n  image: "registry.example.com/team/app:1.2.3"\n  replicas: 3\n';
    const text = Array.from({ length: 12_000 }, (_, i) => line.replace('000000', String(i).padStart(6, '0'))).join('');
    assert.ok(text.length > 900_000);
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      assert.strictEqual(inlineSchemaReference(text, 'yaml'), undefined);
      samples.push(performance.now() - start);
    }
    const worst = Math.max(...samples);
    console.log(`[F13-NFR-03] ${(text.length / 1024).toFixed(0)} KB YAML, no $schema: worst of 5 = ${worst.toFixed(3)} ms`);
    assert.ok(worst < 50, `expected < 50 ms, measured ${worst.toFixed(1)} ms`);
  });
});
