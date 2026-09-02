import * as assert from 'assert';

const { runCli, EXIT } = require('../../cli/cli');
const { createInvoker } = require('../../cli/mcp');

/** In-memory CliIO, mirroring cli.test.ts's harness. */
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
      return Object.keys(files).filter(p => p === dir || p.startsWith(prefix));
    },
  };
}

const PERSON_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string' }, age: { type: 'integer' } },
  additionalProperties: false,
});

const suiteFile = (body: object) => JSON.stringify(body, null, 2);

const FILES = {
  '/w/person.schema.json': PERSON_SCHEMA,
  '/w/ok.schema.test.json': suiteFile({
    schema: './person.schema.json',
    valid: [{ name: 'minimal', instance: { name: 'Ada' } }],
    invalid: [{ name: 'name required', instance: {}, errors: ['required'] }],
  }),
  '/w/bad.schema.test.json': suiteFile({
    schema: './person.schema.json',
    valid: [{ name: 'missing name', instance: {} }],
  }),
  '/w/fixture.json': JSON.stringify({ name: 'Grace' }),
  '/w/fixtures.schema.test.json': suiteFile({
    schema: './person.schema.json',
    valid: [{ name: 'from a file', file: './fixture.json' }],
  }),
  '/w/malformed.schema.test.json': suiteFile({ valid: [] }),
  '/w/noschema.schema.test.json': suiteFile({ schema: './missing.json', valid: [{}] }),
};

suite('[F27-FR-17] jstk test — running suites', () => {
  test('exits 0 when every case passes', async () => {
    const r = await runCli(['test', 'ok.schema.test.json'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.ok);
    assert.match(r.stdout, /2 \/ 2 cases passed/);
  });

  test('exits 1 on a failing case, naming it', async () => {
    const r = await runCli(['test', 'bad.schema.test.json'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.finding);
    assert.match(r.stdout, /Failing cases/);
    assert.match(r.stdout, /missing name/);
  });

  test('loads a case instance from a fixture file', async () => {
    const r = await runCli(['test', 'fixtures.schema.test.json'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.ok);
  });

  test('runs several suites in one invocation', async () => {
    const r = await runCli(['test', 'ok.schema.test.json', 'bad.schema.test.json'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.finding);
    assert.match(r.stdout, /ok\.schema\.test\.json/);
    assert.match(r.stdout, /bad\.schema\.test\.json/);
  });

  test('requires at least one suite file', async () => {
    const r = await runCli(['test'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.usage);
    assert.match(r.stderr, /requires one or more suite files/);
  });

  test('reports an unreadable suite as a data error', async () => {
    const r = await runCli(['test', 'nope.schema.test.json'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.data);
    assert.match(r.stderr, /Cannot read or parse/);
  });

  test('reports a malformed suite as a data error, listing the problems', async () => {
    const r = await runCli(['test', 'malformed.schema.test.json'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.data);
    assert.match(r.stderr, /Malformed suite/);
    assert.match(r.stderr, /must declare "schema"/);
  });

  test('reports an unloadable schema as a data error', async () => {
    const r = await runCli(['test', 'noschema.schema.test.json'], makeIO(FILES));
    assert.strictEqual(r.code, EXIT.data);
    assert.match(r.stderr, /Cannot load schema/);
  });

  test('resolves a remote schema through the injected fetcher', async () => {
    const files = {
      '/w/remote.schema.test.json': suiteFile({
        schema: 'https://schemas.test/person.json',
        valid: [{ instance: { name: 'Ada' } }],
      }),
    };
    const io = makeIO(files, { remote: { 'https://schemas.test/person.json': PERSON_SCHEMA } });
    const r = await runCli(['test', 'remote.schema.test.json'], io);
    assert.strictEqual(r.code, EXIT.ok);
  });

  test('--json emits a machine-readable result', async () => {
    const r = await runCli(['test', 'bad.schema.test.json', '--json'], makeIO(FILES));
    const payload = JSON.parse(r.stdout);
    assert.strictEqual(payload.failed, 1);
    assert.strictEqual(payload.exitCode, EXIT.finding);
    assert.strictEqual(payload.suites[0].suite, 'bad.schema.test.json');
    assert.strictEqual(payload.suites[0].cases[0].passed, false);
    assert.ok(payload.suites[0].cases[0].message);
  });

  test('is listed in the usage text', async () => {
    const r = await runCli([], makeIO({}));
    assert.match(r.stdout, /test <suite-file\.\.\.>/);
    assert.match(r.stdout, /mcp/);
  });
});

suite('[F27-FR-18] jstk mcp — routing', () => {
  test('the pure core explains that mcp is a server, not a report', async () => {
    const r = await runCli(['mcp'], makeIO({}));
    assert.strictEqual(r.code, EXIT.usage);
    assert.match(r.stderr, /stdio server/);
  });
});

suite('[F33-FR-02] createInvoker — tools answer exactly as the CLI does', () => {
  test('a tool invocation returns the CLI\'s own output', async () => {
    const invoke = createInvoker(makeIO(FILES));
    const result = await invoke('jsonschema_test', { suiteFiles: ['ok.schema.test.json'] });
    assert.strictEqual(result.isError, false);
    assert.strictEqual(JSON.parse(result.text).failed, 0);
  });

  test('a failing suite is an answer (not an error) with exit 1', async () => {
    const invoke = createInvoker(makeIO(FILES));
    const result = await invoke('jsonschema_test', { suiteFiles: ['bad.schema.test.json'] });
    assert.strictEqual(result.isError, false, 'a finding is the answer the agent asked for');
    assert.strictEqual(JSON.parse(result.text).failed, 1);
  });

  test('the diff tool returns the same verdict as jstk diff --check', async () => {
    const older = JSON.stringify({ type: 'object', properties: { a: { type: 'string' } } });
    const newer = JSON.stringify({ type: 'object', required: ['a'], properties: { a: { type: 'string' } } });
    const io = makeIO({ '/w/a.json': older, '/w/b.json': newer });

    const cli = await runCli(['diff', 'a.json', 'b.json', '--check', '--json'], io);
    const invoke = createInvoker(io);
    const tool = await invoke('jsonschema_diff', { oldSchemaFile: 'a.json', newSchemaFile: 'b.json' });

    assert.strictEqual(cli.code, EXIT.finding, 'adding a required name is breaking');
    assert.strictEqual(tool.text, cli.stdout);
    assert.strictEqual(tool.isError, false);
  });

  test('an unreadable file becomes a tool error, not a throw', async () => {
    const invoke = createInvoker(makeIO({}));
    const result = await invoke('jsonschema_lint', { schemaFile: 'missing.json' });
    assert.strictEqual(result.isError, true);
    assert.match(result.text, /Cannot read file/);
  });
});
