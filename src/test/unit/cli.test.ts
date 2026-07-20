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
    assert.match(r.stdout, /Usage: json-schema-tools/);
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
