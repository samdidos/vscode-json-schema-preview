import * as assert from 'assert';

const { runCli, EXIT } = require('../../cli/cli');

// An in-memory CliIO: files come from a map keyed by absolute path, remote
// fetches from a url map. runCli resolves relative args against cwd, so the
// fixture keys below are the resolved absolute paths under cwd '/w'.
function makeIO(files: Record<string, string>, opts: { remote?: Record<string, string>; cwd?: string } = {}) {
  const cwd = opts.cwd ?? '/w';
  return {
    cwd,
    version: '9.9.9',
    readFile(absPath: string): string {
      if (!(absPath in files)) { throw new Error(`ENOENT: ${absPath}`); }
      return files[absPath];
    },
    async fetchText(url: string): Promise<string> {
      const remote = opts.remote ?? {};
      if (!(url in remote)) { throw new Error(`HTTP 404 ${url}`); }
      return remote[url];
    },
    walk(dir: string): string[] {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      return Object.keys(files).filter((p) => p === dir || p.startsWith(prefix));
    },
  };
}

const SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string' }, age: { type: 'number' } },
});

// ── Routing, help, version (F27-FR-02/03) ─────────────────────────────────────

suite('[F27-FR-02][F27-NFR-02] runCli — help & version', () => {
  test('no command prints usage and exits 0', async () => {
    const r = await runCli([], makeIO({}));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /Usage: jstk/);
    assert.match(r.stdout, /validate/);
    assert.match(r.stdout, /migrate/);
  });

  test('--help and -h both print usage and exit 0', async () => {
    for (const flag of ['--help', '-h', 'help']) {
      const r = await runCli([flag], makeIO({}));
      assert.strictEqual(r.code, EXIT.ok, flag);
      assert.match(r.stdout, /Commands:/);
    }
  });

  test('--version prints the injected version', async () => {
    const r = await runCli(['--version'], makeIO({}));
    assert.strictEqual(r.code, EXIT.ok);
    assert.strictEqual(r.stdout.trim(), '9.9.9');
  });
});

suite('[F27-FR-03] runCli — unknown command', () => {
  test('names the command and exits with the usage code', async () => {
    const r = await runCli(['frobnicate'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
    assert.match(r.stderr, /Unknown command: frobnicate/);
    assert.match(r.stderr, /Usage:/);
  });
});

// ── validate (F27-FR-04) ──────────────────────────────────────────────────────

suite('[F27-FR-04] runCli validate', () => {
  test('valid data exits 0', async () => {
    const io = makeIO({ '/w/schema.json': SCHEMA, '/w/good.json': '{"name":"Ada","age":36}' });
    const r = await runCli(['validate', 'good.json', '--schema', 'schema.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /is valid against schema\.json/);
  });

  test('invalid data exits 1 and reports each violation with a line', async () => {
    const io = makeIO({ '/w/schema.json': SCHEMA, '/w/bad.json': '{\n  "age": "old"\n}' });
    const r = await runCli(['validate', 'bad.json', '--schema', 'schema.json'], io);
    assert.strictEqual(r.code, EXIT.finding);
    assert.match(r.stdout, /required property 'name'/);
    assert.match(r.stdout, /line \d+: \/age: must be number/);
  });

  test('[F27-FR-09] --json emits valid flag, issues with 1-based lines, and exitCode', async () => {
    const io = makeIO({ '/w/schema.json': SCHEMA, '/w/bad.json': '{ "age": "old" }' });
    const r = await runCli(['validate', 'bad.json', '--schema', 'schema.json', '--json'], io);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.valid, false);
    assert.strictEqual(parsed.exitCode, EXIT.finding);
    assert.ok(parsed.issues.length >= 2);
  });

  test('[F27-FR-10] missing --schema is a usage error (64)', async () => {
    const r = await runCli(['validate', 'good.json'], makeIO({ '/w/good.json': '{}' }));
    assert.strictEqual(r.code, EXIT.usage);
    assert.match(r.stderr, /requires a data file and --schema/);
  });

  test('[F27-FR-10] an unreadable data file is a data error (65)', async () => {
    const io = makeIO({ '/w/schema.json': SCHEMA });
    const r = await runCli(['validate', 'nope.json', '--schema', 'schema.json'], io);
    assert.strictEqual(r.code, EXIT.data);
    assert.match(r.stderr, /Cannot read file: nope\.json/);
  });

  test('an unparseable schema is a data error (65)', async () => {
    const io = makeIO({ '/w/schema.json': '{ not json', '/w/good.json': '{}' });
    const r = await runCli(['validate', 'good.json', '--schema', 'schema.json'], io);
    assert.strictEqual(r.code, EXIT.data);
    assert.match(r.stderr, /Cannot parse schema/);
  });

  test('validates a YAML data file by its extension', async () => {
    const io = makeIO({ '/w/schema.json': SCHEMA, '/w/data.yaml': 'name: Ada\nage: 36\n' });
    const r = await runCli(['validate', 'data.yaml', '--schema', 'schema.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
  });
});

// ── lint (F27-FR-05) ──────────────────────────────────────────────────────────

suite('[F27-FR-05] runCli lint', () => {
  test('reports findings with rule id and line, exit 0 when none are warnings', async () => {
    const io = makeIO({ '/w/s.json': '{ "type": "object", "properties": { "a": { "type": "string" } } }' });
    const r = await runCli(['lint', 's.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /\[require-descriptions\]/);
    assert.match(r.stdout, /line \d+/);
  });

  test('exits 1 when a finding is warning severity', async () => {
    // An unknown keyword is a `warning`-severity rule (no-unknown-keywords).
    const io = makeIO({ '/w/s.json': '{ "type": "object", "notAKeyword": 1 }' });
    const r = await runCli(['lint', 's.json'], io);
    assert.strictEqual(r.code, EXIT.finding);
    assert.match(r.stdout, /no-unknown-keywords/);
  });

  test('a clean schema reports no findings and exits 0', async () => {
    const clean = JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://x/s.json',
      title: 'S',
      description: 'a well-formed schema',
      type: 'object',
      additionalProperties: false,
      properties: {},
    });
    const r = await runCli(['lint', 's.json'], makeIO({ '/w/s.json': clean }));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /no schema-quality findings/);
  });

  test('[F27-FR-09] --json lists findings with severity and exitCode', async () => {
    const io = makeIO({ '/w/s.json': '{ "type": "object", "notAKeyword": 1 }' });
    const r = await runCli(['lint', 's.json', '--json'], io);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.finding);
    assert.ok(parsed.findings.some((f: any) => f.ruleId === 'no-unknown-keywords' && f.severity === 'warning'));
  });

  test('missing schema argument is a usage error', async () => {
    const r = await runCli(['lint'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── diff (F27-FR-06) ──────────────────────────────────────────────────────────

const V1 = JSON.stringify({ type: 'object', properties: { id: { type: ['string', 'number'] } } });
const V2 = JSON.stringify({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } });

suite('[F27-FR-06] runCli diff', () => {
  test('plain diff prints the report and exits 0', async () => {
    const r = await runCli(['diff', 'v1.json', 'v2.json'], makeIO({ '/w/v1.json': V1, '/w/v2.json': V2 }));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /Schema diff/);
  });

  test('--check exits 1 on a breaking change', async () => {
    const r = await runCli(['diff', 'v1.json', 'v2.json', '--check'], makeIO({ '/w/v1.json': V1, '/w/v2.json': V2 }));
    assert.strictEqual(r.code, EXIT.finding);
    assert.match(r.stdout, /NOT backward-compatible/);
  });

  test('--check on an identical schema exits 0', async () => {
    const same = JSON.stringify({ type: 'object' });
    const r = await runCli(['diff', 'a.json', 'b.json', '--check'], makeIO({ '/w/a.json': same, '/w/b.json': same }));
    assert.strictEqual(r.code, EXIT.ok);
  });

  test('--check --strict exits 2 when an unclassified change is the only incompatibility', async () => {
    // A same-length oneOf branch swap is unclassified (F15) — the classifier
    // cannot prove safety, so strict mode reports "unknown" (2), not breaking.
    const a = JSON.stringify({ oneOf: [{ type: 'string' }] });
    const b = JSON.stringify({ oneOf: [{ type: 'number' }] });
    const r = await runCli(['diff', 'a.json', 'b.json', '--check', '--strict'], makeIO({ '/w/a.json': a, '/w/b.json': b }));
    assert.strictEqual(r.code, EXIT.unknown);
  });

  test('--json without --check emits summary + entries', async () => {
    const r = await runCli(['diff', 'v1.json', 'v2.json', '--json'], makeIO({ '/w/v1.json': V1, '/w/v2.json': V2 }));
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.ok(parsed.summary.breaking >= 1);
    assert.ok(Array.isArray(parsed.entries));
  });

  test('--json --check emits the verdict', async () => {
    const r = await runCli(['diff', 'v1.json', 'v2.json', '--check', '--json'], makeIO({ '/w/v1.json': V1, '/w/v2.json': V2 }));
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.finding);
    assert.strictEqual(parsed.verdict.compatible, false);
  });

  test('one missing file is a data error', async () => {
    const r = await runCli(['diff', 'v1.json', 'gone.json'], makeIO({ '/w/v1.json': V1 }));
    assert.strictEqual(r.code, EXIT.data);
  });

  test('too few arguments is a usage error', async () => {
    const r = await runCli(['diff', 'only.json'], makeIO({ '/w/only.json': V1 }));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── bundle (F27-FR-07) ────────────────────────────────────────────────────────

suite('[F27-FR-07] runCli bundle', () => {
  test('resolves a relative $ref from the filesystem into $defs', async () => {
    const io = makeIO({
      '/w/root.json': '{ "type": "object", "properties": { "n": { "$ref": "defs/name.json" } } }',
      '/w/defs/name.json': '{ "type": "string", "minLength": 1 }',
    });
    const r = await runCli(['bundle', 'root.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    const schema = JSON.parse(r.stdout);
    assert.strictEqual(schema.properties.n.$ref, '#/$defs/name');
    assert.strictEqual(schema.$defs.name.minLength, 1);
    assert.strictEqual(schema.strippedIds, undefined, 'internal bookkeeping must not leak into output');
  });

  test('resolves a remote $ref through fetchText', async () => {
    const io = makeIO(
      { '/w/root.json': '{ "properties": { "n": { "$ref": "https://x/name.json" } } }' },
      { remote: { 'https://x/name.json': '{ "type": "string" }' } },
    );
    const r = await runCli(['bundle', 'root.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /"\$defs"/);
  });

  test('--dereference inlines the ref', async () => {
    const io = makeIO({
      '/w/root.json': '{ "type": "object", "properties": { "n": { "$ref": "defs/name.json" } } }',
      '/w/defs/name.json': '{ "type": "string" }',
    });
    const r = await runCli(['bundle', 'root.json', '--dereference'], io);
    assert.strictEqual(r.code, EXIT.ok);
    const schema = JSON.parse(r.stdout);
    assert.strictEqual(schema.properties.n.type, 'string');
  });

  test('an unresolvable ref is a data error', async () => {
    const io = makeIO({ '/w/root.json': '{ "properties": { "n": { "$ref": "missing.json" } } }' });
    const r = await runCli(['bundle', 'root.json'], io);
    assert.strictEqual(r.code, EXIT.data);
    assert.match(r.stderr, /Cannot bundle/);
  });

  test('missing schema argument is a usage error', async () => {
    const r = await runCli(['bundle'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── migrate (F27-FR-08) ───────────────────────────────────────────────────────

const MODERN = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  $defs: { x: { type: 'string' } },
});

suite('[F27-FR-08] runCli migrate', () => {
  test('emits the migrated schema on stdout and the change list on stderr', async () => {
    const r = await runCli(['migrate', 's.json', '--to', 'draft-07'], makeIO({ '/w/s.json': MODERN }));
    assert.strictEqual(r.code, EXIT.ok);
    const schema = JSON.parse(r.stdout);
    assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.ok(schema.definitions, '$defs should become definitions for draft-07');
    assert.match(r.stderr, /change\(s\)/);
  });

  test('--json puts schema + changes on stdout', async () => {
    const r = await runCli(['migrate', 's.json', '--to', 'draft-07', '--json'], makeIO({ '/w/s.json': MODERN }));
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.ok(Array.isArray(parsed.changes));
    assert.strictEqual(parsed.schema.$schema, 'http://json-schema.org/draft-07/schema#');
  });

  test('supports --to=<draft> equals form', async () => {
    const r = await runCli(['migrate', 's.json', '--to=draft-07'], makeIO({ '/w/s.json': MODERN }));
    assert.strictEqual(r.code, EXIT.ok);
  });

  test('an unknown target draft is a usage error', async () => {
    const r = await runCli(['migrate', 's.json', '--to', 'draft-99'], makeIO({ '/w/s.json': MODERN }));
    assert.strictEqual(r.code, EXIT.usage);
    assert.match(r.stderr, /--to/);
  });

  test('missing --to is a usage error', async () => {
    const r = await runCli(['migrate', 's.json'], makeIO({ '/w/s.json': MODERN }));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── infer (F27-FR-11) ─────────────────────────────────────────────────────────

suite('[F27-FR-11] runCli infer', () => {
  test('infers a 2020-12 schema by default from a JSON data file', async () => {
    const io = makeIO({ '/w/d.json': '{"name":"Ada","age":36}' });
    const r = await runCli(['infer', 'd.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    const schema = JSON.parse(r.stdout);
    assert.strictEqual(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(schema.type, 'object');
    assert.ok(schema.properties.name && schema.properties.age);
  });

  test('--to draft-07 declares the draft-07 meta-schema', async () => {
    const io = makeIO({ '/w/d.json': '{"a":1}' });
    const r = await runCli(['infer', 'd.json', '--to', 'draft-07'], io);
    assert.strictEqual(r.code, EXIT.ok);
    const schema = JSON.parse(r.stdout);
    assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  });

  test('--to 2019-09 declares the 2019-09 meta-schema', async () => {
    const io = makeIO({ '/w/d.json': '{"a":1}' });
    const r = await runCli(['infer', 'd.json', '--to', '2019-09'], io);
    assert.strictEqual(r.code, EXIT.ok);
    const schema = JSON.parse(r.stdout);
    assert.strictEqual(schema.$schema, 'https://json-schema.org/draft/2019-09/schema');
  });

  test('an unknown --to draft is a usage error', async () => {
    const r = await runCli(['infer', 'd.json', '--to', 'draft-99'], makeIO({ '/w/d.json': '{"a":1}' }));
    assert.strictEqual(r.code, EXIT.usage);
    assert.match(r.stderr, /--to/);
  });

  test('infers over the records of a JSONL file (array schema)', async () => {
    const io = makeIO({ '/w/d.jsonl': '{"a":1}\n{"a":2}\n' });
    const r = await runCli(['infer', 'd.jsonl'], io);
    assert.strictEqual(r.code, EXIT.ok);
    const schema = JSON.parse(r.stdout);
    assert.strictEqual(schema.type, 'array');
  });

  test('--json wraps the inferred schema with exitCode', async () => {
    const r = await runCli(['infer', 'd.json', '--json'], makeIO({ '/w/d.json': '{"a":1}' }));
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.strictEqual(parsed.schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  });

  test('an unparseable data file is a data error', async () => {
    const r = await runCli(['infer', 'd.json'], makeIO({ '/w/d.json': '{nope' }));
    assert.strictEqual(r.code, EXIT.data);
  });

  test('missing data file is a usage error', async () => {
    const r = await runCli(['infer'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── sample (F27-FR-12) ────────────────────────────────────────────────────────

suite('[F27-FR-12] runCli sample', () => {
  const SCH = JSON.stringify({
    type: 'object', required: ['name'],
    properties: { name: { type: 'string' }, role: { $ref: '#/$defs/role' } },
    $defs: { role: { enum: ['admin', 'user'] } },
  });

  test('generates a valid instance, resolving a same-document $ref', async () => {
    const r = await runCli(['sample', 's.json'], makeIO({ '/w/s.json': SCH }));
    assert.strictEqual(r.code, EXIT.ok);
    const value = JSON.parse(r.stdout);
    assert.strictEqual(typeof value.name, 'string');
  });

  test('--json wraps the sample with exitCode', async () => {
    const r = await runCli(['sample', 's.json', '--json'], makeIO({ '/w/s.json': SCH }));
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.ok('sample' in parsed);
  });

  test('an unsatisfiable schema reports the failure and exits with the data code', async () => {
    // minLength 5 but maxLength 2 cannot be satisfied.
    const bad = JSON.stringify({ type: 'string', minLength: 5, maxLength: 2 });
    const r = await runCli(['sample', 's.json'], makeIO({ '/w/s.json': bad }));
    assert.strictEqual(r.code, EXIT.data);
    assert.match(r.stderr, /Cannot generate a valid sample/);
  });

  test('missing schema file is a usage error', async () => {
    const r = await runCli(['sample'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── types (F27-FR-13) ─────────────────────────────────────────────────────────

const TYPES_SCHEMA = JSON.stringify({
  title: 'User', type: 'object', required: ['name'],
  properties: { name: { type: 'string' }, age: { type: 'integer' } },
});

suite('[F27-FR-13] runCli types', () => {
  test('generates TypeScript by default', async () => {
    const r = await runCli(['types', 'user.json'], makeIO({ '/w/user.json': TYPES_SCHEMA }));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /export interface User/);
  });

  test('--lang python generates Python', async () => {
    const r = await runCli(['types', 'user.json', '--lang', 'python'], makeIO({ '/w/user.json': TYPES_SCHEMA }));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /class User/);
  });

  test('bundles an external $ref before generating', async () => {
    const io = makeIO({
      '/w/user.json': JSON.stringify({ title: 'User', type: 'object', properties: { role: { $ref: 'role.json' } } }),
      '/w/role.json': JSON.stringify({ title: 'Role', enum: ['admin', 'user'] }),
    });
    const r = await runCli(['types', 'user.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /export interface User/);
  });

  test('--json wraps the code with lang + exitCode', async () => {
    const r = await runCli(['types', 'user.json', '--json'], makeIO({ '/w/user.json': TYPES_SCHEMA }));
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.strictEqual(parsed.lang, 'typescript');
    assert.match(parsed.code, /interface User/);
  });

  test('an unknown --lang is a usage error listing the supported ids', async () => {
    const r = await runCli(['types', 'user.json', '--lang', 'klingon'], makeIO({ '/w/user.json': TYPES_SCHEMA }));
    assert.strictEqual(r.code, EXIT.usage);
    assert.match(r.stderr, /typescript/);
  });

  test('missing schema file is a usage error', async () => {
    const r = await runCli(['types'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── coverage (F27-FR-14) ──────────────────────────────────────────────────────

suite('[F27-FR-14] runCli coverage', () => {
  const SCH = JSON.stringify({
    type: 'object',
    properties: { name: { type: 'string' }, age: { type: 'integer' }, role: { type: 'string' } },
  });

  test('reports exercised vs unexercised properties', async () => {
    const io = makeIO({ '/w/s.json': SCH, '/w/d.json': '{"name":"Ada","age":36}' });
    const r = await runCli(['coverage', 'd.json', '--schema', 's.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /2 \/ 3 declared properties exercised/);
    assert.match(r.stdout, /role/);
  });

  test('--json lists exercised, unexercised and percent', async () => {
    const io = makeIO({ '/w/s.json': SCH, '/w/d.json': '{"name":"Ada"}' });
    const r = await runCli(['coverage', 'd.json', '--schema', 's.json', '--json'], io);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.strictEqual(parsed.total, 3);
    assert.ok(parsed.unexercised.includes('age') && parsed.unexercised.includes('role'));
  });

  test('missing --schema is a usage error', async () => {
    const r = await runCli(['coverage', 'd.json'], makeIO({ '/w/d.json': '{}' }));
    assert.strictEqual(r.code, EXIT.usage);
  });

  test('missing data files is a usage error', async () => {
    const r = await runCli(['coverage', '--schema', 's.json'], makeIO({ '/w/s.json': SCH }));
    assert.strictEqual(r.code, EXIT.usage);
  });

  test('an unreadable data file is a data error', async () => {
    const r = await runCli(['coverage', 'gone.json', '--schema', 's.json'], makeIO({ '/w/s.json': SCH }));
    assert.strictEqual(r.code, EXIT.data);
  });

  test('unions coverage across multiple data files, including JSONL', async () => {
    const io = makeIO({
      '/w/s.json': SCH,
      '/w/a.json': '{"name":"Ada"}',
      '/w/b.jsonl': '{"age":36}\n{"role":"admin"}\n',
    });
    const r = await runCli(['coverage', 'a.json', 'b.jsonl', '--schema', 's.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /3 \/ 3 declared properties exercised/);
  });
});

// ── graph (F27-FR-16) ─────────────────────────────────────────────────────────

const GRAPH_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { role: { $ref: '#/$defs/role' }, boss: { $ref: '#/$defs/person' } },
  $defs: { role: { enum: ['a', 'b'] }, person: { properties: { manager: { $ref: '#/$defs/person' } } } },
});

suite('[F27-FR-16] runCli graph', () => {
  test('prints the summary, cycle line, and adjacency list', async () => {
    const r = await runCli(['graph', 's.json'], makeIO({ '/w/s.json': GRAPH_SCHEMA }));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /references, .* definitions/);
    assert.match(r.stdout, /\(root\) \[root\]/);
    // person → person is a self-cycle.
    assert.match(r.stdout, /cycle:/);
  });

  test('--svg emits an SVG document', async () => {
    const r = await runCli(['graph', 's.json', '--svg'], makeIO({ '/w/s.json': GRAPH_SCHEMA }));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /^<svg/);
  });

  test('--json exposes nodes, edges and cycle', async () => {
    const r = await runCli(['graph', 's.json', '--json'], makeIO({ '/w/s.json': GRAPH_SCHEMA }));
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.ok(Array.isArray(parsed.nodes) && Array.isArray(parsed.edges));
  });

  test('an unparseable schema is a data error', async () => {
    const r = await runCli(['graph', 's.json'], makeIO({ '/w/s.json': '{nope' }));
    assert.strictEqual(r.code, EXIT.data);
  });

  test('missing schema file is a usage error', async () => {
    const r = await runCli(['graph'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
  });
});

// ── validate --workspace (F27-FR-15) ──────────────────────────────────────────

suite('[F27-FR-15] runCli validate --workspace', () => {
  const SCHEMA = JSON.stringify({ type: 'object', required: ['name'], properties: { name: { type: 'string' } } });

  test('validates every inline-$schema-bound data file and reports valid', async () => {
    const io = makeIO({
      '/w/proj/schema.json': SCHEMA,
      '/w/proj/good.json': JSON.stringify({ $schema: './schema.json', name: 'Ada' }),
    });
    const r = await runCli(['validate', 'proj', '--workspace'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /Workspace validation report/);
    assert.match(r.stdout, /✅ valid `good\.json`/);
  });

  test('exits 1 when a bound file is invalid', async () => {
    const io = makeIO({
      '/w/proj/schema.json': SCHEMA,
      '/w/proj/bad.json': JSON.stringify({ $schema: './schema.json', age: 1 }),
    });
    const r = await runCli(['validate', 'proj', '--workspace'], io);
    assert.strictEqual(r.code, EXIT.finding);
    assert.match(r.stdout, /❌ errors `bad\.json`/);
  });

  test('a missing bound schema is a binding failure (exit 1)', async () => {
    const io = makeIO({ '/w/proj/data.json': JSON.stringify({ $schema: './gone.json', name: 'Ada' }) });
    const r = await runCli(['validate', 'proj', '--workspace'], io);
    assert.strictEqual(r.code, EXIT.finding);
    assert.match(r.stdout, /binding failed/);
  });

  test('skips files without an inline $schema and schema files (meta-schema $schema)', async () => {
    const io = makeIO({
      '/w/proj/schema.json': JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' }),
      '/w/proj/plain.json': JSON.stringify({ name: 'no binding here' }),
    });
    const r = await runCli(['validate', 'proj', '--workspace'], io);
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /No inline-\$schema-bound data files found/);
  });

  test('--json reports the results array and checked count', async () => {
    const io = makeIO({
      '/w/proj/schema.json': SCHEMA,
      '/w/proj/good.json': JSON.stringify({ $schema: './schema.json', name: 'Ada' }),
    });
    const r = await runCli(['validate', 'proj', '--workspace', '--json'], io);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.exitCode, EXIT.ok);
    assert.strictEqual(parsed.checked, 1);
  });
});
