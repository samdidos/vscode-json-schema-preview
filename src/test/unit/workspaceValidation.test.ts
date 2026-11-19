import * as assert from 'assert';

const {
  languageIdForPath,
  isMetaSchemaRef,
  parseDataText,
  validateInstances,
  withoutBindingKeyErrors,
  locateInstancePath,
  lineOfMatch,
  summarize,
  summaryLine,
  renderMarkdownReport,
  MAX_FILE_BYTES,
  DEFAULT_MAX_FILES,
} = require('../../workspaceValidation');

const META: any = { truncated: false, maxFiles: DEFAULT_MAX_FILES, untrusted: false, skippedLarge: 0 };

suite('[F20-FR-02] workspaceValidation — classification helpers', () => {
  test('languageIdForPath maps supported extensions and rejects others', () => {
    assert.strictEqual(languageIdForPath('/a/b.json'), 'json');
    assert.strictEqual(languageIdForPath('/a/b.jsonc'), 'jsonc');
    assert.strictEqual(languageIdForPath('/a/b.jsonl'), 'jsonl');
    assert.strictEqual(languageIdForPath('/a/b.yml'), 'yaml');
    assert.strictEqual(languageIdForPath('/a/b.YAML'), 'yaml');
    assert.strictEqual(languageIdForPath('/a/b.toml'), 'toml');
    assert.strictEqual(languageIdForPath('/a/b.txt'), undefined);
    assert.strictEqual(languageIdForPath('/a/b'), undefined);
  });

  test('isMetaSchemaRef recognises meta-schema URIs, not ordinary schemas', () => {
    assert.ok(isMetaSchemaRef('https://json-schema.org/draft/2020-12/schema'));
    assert.ok(isMetaSchemaRef('http://json-schema.org/draft-07/schema#'));
    assert.ok(!isMetaSchemaRef('./config.schema.json'));
    assert.ok(!isMetaSchemaRef('https://corp.example/schemas/config.json'));
  });

  test('the caps match the spec (F20-FR-03)', () => {
    assert.strictEqual(MAX_FILE_BYTES, 1024 * 1024);
    assert.strictEqual(DEFAULT_MAX_FILES, 2000);
  });
});

suite('[F20-FR-04][F20-NFR-01] workspaceValidation — data parsing & validation', () => {
  test('parseDataText handles every supported language', () => {
    assert.deepStrictEqual(parseDataText('{"a":1}', 'json'), [{ a: 1 }]);
    assert.deepStrictEqual(parseDataText('// c\n{"a":1}', 'jsonc'), [{ a: 1 }]);
    assert.deepStrictEqual(parseDataText('{"a":1}\n{"a":2}', 'jsonl'), [{ a: 1 }, { a: 2 }]);
    assert.deepStrictEqual(parseDataText('a: 1', 'yaml'), [{ a: 1 }]);
    assert.deepStrictEqual(parseDataText('a = 1', 'toml'), [{ a: 1 }]);
    assert.throws(() => parseDataText('{nope', 'json'));
  });

  test('validateInstances returns no issues for valid data', () => {
    const schema = { type: 'object', required: ['a'], properties: { a: { type: 'number' } } };
    assert.deepStrictEqual(validateInstances([{ a: 1 }], schema, '{"a":1}'), []);
  });

  test('validateInstances reports one located issue per Ajv error', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' }, port: { type: 'number' } },
    };
    const text = '{\n  "port": "not-a-number"\n}';
    const issues = validateInstances([{ port: 'not-a-number' }], schema, text);
    assert.strictEqual(issues.length, 2);
    const messages = issues.map((i: any) => i.message).join('; ');
    assert.match(messages, /\(root\):.*required/);
    assert.match(messages, /\/port:.*string|\/port:.*number/);
    const portIssue = issues.find((i: any) => i.message.startsWith('/port'));
    assert.strictEqual(portIssue.line, 1, 'port error must locate its line');
  });

  test('validateInstances throws when the schema does not compile', () => {
    assert.throws(() => validateInstances([{}], { type: 'object', properties: { a: { type: 'nope' } } }, '{}'));
  });

  test('locateInstancePath finds the deepest locatable key, TOML included', () => {
    assert.strictEqual(locateInstancePath('{\n"a": {\n  "b": 1\n}\n}', '/a/b'), 2);
    assert.strictEqual(locateInstancePath('a = 1\nport = 99\n', '/port', 'toml'), 1);
    assert.strictEqual(locateInstancePath('{}', '/missing'), undefined);
    assert.strictEqual(locateInstancePath('{"x": [1]}', '/x/0'), 0);
  });

  test('locateInstancePath resolves a repeated key name to the right occurrence (AST-exact)', () => {
    // "port" appears first under /x — a text scan would stop there; the AST
    // locator must land on the /a/port occurrence the error actually names.
    const json = '{\n  "x": { "port": 1 },\n  "a": { "port": "bad" }\n}';
    assert.strictEqual(locateInstancePath(json, '/a/port'), 2);
    const yaml = 'x:\n  port: 1\na:\n  port: bad\n';
    assert.strictEqual(locateInstancePath(yaml, '/a/port', 'yaml'), 3);
  });

  test('lineOfMatch returns 0-based lines and undefined for no match', () => {
    assert.strictEqual(lineOfMatch('a\nb\nc', /b/), 1);
    assert.strictEqual(lineOfMatch('a', /z/), undefined);
  });
});

suite('[F20-FR-06] workspaceValidation — summary', () => {
  const results: any[] = [
    { relPath: 'a.json', folder: 'A', kind: 'data', status: 'valid', issues: [] },
    { relPath: 'b.json', folder: 'A', kind: 'data', status: 'errors', issues: [{ message: 'x' }] },
    { relPath: 'c.toml', folder: 'B', kind: 'data', status: 'binding-failed', issues: [{ message: 'y' }] },
    { relPath: 's.schema.json', folder: 'A', kind: 'schema', status: 'lint-findings', issues: [{ message: 'z' }] },
  ];

  test('summarize counts by kind and status', () => {
    assert.deepStrictEqual(summarize(results), {
      filesChecked: 3, valid: 1, withErrors: 1, schemasLinted: 1, bindingsFailed: 1,
      // F20-FR-09 — suites are counted separately; a workspace with none reports zero.
      suitesRun: 0, casesFailed: 0,
    });
  });

  test('summaryLine mentions every count and the truncation/trust notes', () => {
    const line = summaryLine(summarize(results), { ...META, truncated: true, maxFiles: 10, untrusted: true });
    assert.match(line, /3 files checked/);
    assert.match(line, /1 valid/);
    assert.match(line, /1 with errors/);
    assert.match(line, /1 schema linted/);
    assert.match(line, /1 binding failed/);
    assert.match(line, /capped at 10 files/);
    assert.match(line, /Untrusted workspace/);
  });
});

suite('[F20-FR-07] workspaceValidation — Markdown report', () => {
  test('groups files by folder with per-file status and error lines', () => {
    const report = renderMarkdownReport([
      { relPath: 'app/config.json', folder: 'backend', kind: 'data', status: 'errors', schemaRef: './config.schema.json', issues: [{ message: '/port: must be number', line: 4 }] },
      { relPath: 'infra.toml', folder: 'infra', kind: 'data', status: 'valid', schemaRef: 'https://corp/infra.json', issues: [] },
      { relPath: 'config.schema.json', folder: 'backend', kind: 'schema', status: 'clean-schema', issues: [] },
    ], META);
    assert.match(report, /^## Workspace validation report/);
    assert.match(report, /\*\*2\*\* data file\(s\) checked/);
    assert.match(report, /### backend \(2 file\(s\)\)/);
    assert.match(report, /### infra \(1 file\(s\)\)/);
    assert.match(report, /❌ errors `app\/config\.json` — `\.\/config\.schema\.json`/);
    assert.match(report, /line 5: \/port: must be number/);
    assert.match(report, /✅ valid `infra\.toml`/);
    const backendIdx = report.indexOf('### backend');
    const infraIdx = report.indexOf('### infra');
    assert.ok(backendIdx < infraIdx, 'folders are sorted');
  });

  test('binding failures and notes appear in the report', () => {
    const report = renderMarkdownReport([
      { relPath: 'x.json', folder: '', kind: 'data', status: 'binding-failed', schemaRef: './gone.json', issues: [{ message: 'Cannot load schema' }] },
    ], { truncated: true, maxFiles: 5, untrusted: true, skippedLarge: 2 });
    assert.match(report, /⚠️ binding failed `x\.json`/);
    assert.match(report, /Scan capped at 5 files/);
    assert.match(report, /2 file\(s\) over 1 MiB skipped/);
    assert.match(report, /Untrusted workspace/);
    assert.match(report, /### Workspace \(1 file\(s\)\)/);
  });
});

suite('[F03-FR-18] the inline $schema binding is not an unexpected property', () => {
  const closed = {
    type: 'object',
    properties: { name: { type: 'string' } },
    additionalProperties: false,
  };

  test('a closed schema accepts the file\'s own root $schema binding', () => {
    const text = '{"$schema":"./s.json","name":"x"}';
    assert.deepStrictEqual(validateInstances([JSON.parse(text)], closed, text), []);
  });

  test('every other unexpected property is still reported, $-prefixed ones included', () => {
    const data = { $schema: './s.json', name: 'x', $typ: 'a', extra: 1 };
    const messages = validateInstances([data], closed, JSON.stringify(data)).map((i: any) => i.message);
    assert.strictEqual(messages.length, 2);
    assert.ok(messages.every((m: string) => m.includes('must NOT have additional properties')));
  });

  test('unevaluatedProperties and propertyNames errors about the binding are dropped too', () => {
    const data = { $schema: './s.json', name: 'x' };
    const unevaluated = { $schema: 'https://json-schema.org/draft/2020-12/schema', properties: { name: {} }, unevaluatedProperties: false };
    assert.deepStrictEqual(validateInstances([data], unevaluated, JSON.stringify(data)), []);
    const names = { type: 'object', propertyNames: { pattern: '^[a-z]+$' } };
    assert.deepStrictEqual(validateInstances([data], names, JSON.stringify(data)), []);
  });

  test('what a schema itself says about $schema still applies', () => {
    const typed = { type: 'object', properties: { $schema: { type: 'string', const: './other.json' } }, additionalProperties: false };
    const data = { $schema: './s.json' };
    assert.strictEqual(validateInstances([data], typed, JSON.stringify(data)).length, 1);
  });

  test('only a string root $schema is a binding: non-string, nested and JSONL ones are data', () => {
    const err = { instancePath: '', keyword: 'additionalProperties', params: { additionalProperty: '$schema' } };
    assert.deepStrictEqual(withoutBindingKeyErrors([err], { $schema: './s.json' }), []);
    assert.deepStrictEqual(withoutBindingKeyErrors([err], { $schema: 42 }), [err]);
    assert.deepStrictEqual(withoutBindingKeyErrors([err], { $schema: './s.json' }, 0), [err]);
    assert.deepStrictEqual(withoutBindingKeyErrors([err], ['$schema']), [err]);
    assert.deepStrictEqual(withoutBindingKeyErrors([err], null), [err]);
    const nested = { ...err, instancePath: '/child' };
    assert.deepStrictEqual(withoutBindingKeyErrors([nested], { $schema: './s.json' }), [nested]);
    const other = { instancePath: '', keyword: 'additionalProperties', params: { additionalProperty: '$id' } };
    assert.deepStrictEqual(withoutBindingKeyErrors([other], { $schema: './s.json' }), [other]);
    const required = { instancePath: '', keyword: 'required', params: { missingProperty: 'name' } };
    assert.deepStrictEqual(withoutBindingKeyErrors([required], { $schema: './s.json' }), [required]);
    const inner = { instancePath: '', keyword: 'pattern', params: { pattern: '^[a-z]+$' }, propertyName: '$schema' };
    assert.deepStrictEqual(withoutBindingKeyErrors([inner], { $schema: './s.json' }), []);
    const noParams = { instancePath: '', keyword: 'type' };
    assert.deepStrictEqual(withoutBindingKeyErrors([noParams], { $schema: './s.json' }), [noParams]);
  });

  test('a JSONL record\'s $schema is still an unexpected property', () => {
    const text = '{"$schema":"./s.json","name":"x"}';
    const issues = validateInstances(parseDataText(text, 'jsonl'), closed, text, 'jsonl');
    assert.strictEqual(issues.length, 1);
  });
});
