import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscodeMock from '../mocks/vscode';

const { suiteDiagnostics, registerSchemaTests, RUN_TESTS_COMMAND } = require('../../SchemaTestsCommand');

// The command reads suites through `workspace.fs` and fixtures through `fs`, and
// confines both to the workspace folder — so these tests run it against a real
// directory rather than stubbing every read.

const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
};

interface Collection {
  clear: sinon.SinonStub;
  set: sinon.SinonStub;
  delete: sinon.SinonStub;
  dispose: sinon.SinonStub;
}

suite('SchemaTestsCommand — running suites from the editor', () => {
  let root: string;
  let outside: string;
  let collection: Collection;
  let context: { subscriptions: unknown[] };

  function write(rel: string, content: unknown, base = root): string {
    const abs = path.join(base, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return abs;
  }

  function open(abs: string, languageId = 'json'): void {
    const text = fs.readFileSync(abs, 'utf-8');
    vscodeMock.window.activeTextEditor = {
      document: {
        languageId,
        fileName: abs,
        uri: { fsPath: abs, path: abs, scheme: 'file', toString: () => `file://${abs}` },
        getText: () => text,
      },
    };
  }

  async function run(): Promise<void> {
    registerSchemaTests(context as never);
    const call = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === RUN_TESTS_COMMAND);
    assert.ok(call, 'the run command is registered');
    await call.args[1]();
  }

  /** Diagnostics the run published for `abs`. */
  function published(abs: string): Array<{ message: string; range: { start: { line: number; character: number } } }> {
    const call = collection.set.getCalls().find(c => c.args[0].fsPath === abs);
    assert.ok(call, `diagnostics were set for ${path.basename(abs)}`);
    return call.args[1];
  }

  setup(() => {
    vscodeMock.resetAll();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-suite-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-outside-'));
    collection = { clear: sinon.stub(), set: sinon.stub(), delete: sinon.stub(), dispose: sinon.stub() };
    context = { subscriptions: [] };
    vscodeMock.languages.createDiagnosticCollection.returns(collection);
    vscodeMock.workspace.getWorkspaceFolder.callsFake((uri: { fsPath: string }) =>
      uri.fsPath.startsWith(root + path.sep) ? { uri: { fsPath: root } } : undefined);
    vscodeMock.workspace.fs.readFile.callsFake(async (uri: { fsPath: string }) => fs.readFileSync(uri.fsPath));
    write('person.schema.json', SCHEMA);
  });

  teardown(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  test('[F29-FR-10] registration disposes the diagnostic collection and the command with the extension', () => {
    registerSchemaTests(context as never);
    assert.strictEqual(vscodeMock.languages.createDiagnosticCollection.firstCall.args[0], 'jsonschema-tests');
    assert.strictEqual(context.subscriptions.length, 2);
    assert.strictEqual(context.subscriptions[0], collection);
  });

  test('[F29-FR-10] with no active editor it says what to open and runs nothing', async () => {
    await run();
    assert.match(vscodeMock.window.showInformationMessage.firstCall.args[0], /Open a schema or a \*\.schema\.test\.json suite/);
    assert.strictEqual(vscodeMock.window.showInformationMessage.callCount, 1);
    assert.strictEqual(collection.clear.callCount, 0);
    assert.strictEqual(collection.set.callCount, 0);
  });

  test('[F29-FR-10] a file that is neither a suite nor a schema finds no suite', async () => {
    open(write('notes.json', { hello: 'world' }));
    vscodeMock.setConfig('jsonschema', 'schemaDetection', 'strict');
    await run();
    assert.match(vscodeMock.window.showInformationMessage.firstCall.args[0], /No schema test suite found/);
    assert.strictEqual(vscodeMock.workspace.findFiles.callCount, 0);
    assert.strictEqual(collection.clear.callCount, 0);
  });

  test('[F29-FR-10] an active suite runs itself and reports the passing total', async () => {
    const suitePath = write('person.schema.test.json', {
      schema: './person.schema.json',
      valid: [{ name: 'Ada' }, { name: 'Grace' }],
      invalid: [{ name: 1 }],
    });
    open(suitePath);
    await run();
    assert.strictEqual(vscodeMock.window.showInformationMessage.firstCall.args[0], '✓ 3/3 schema test cases passed.');
    assert.strictEqual(vscodeMock.window.showInformationMessage.firstCall.args[1], 'Copy report');
    assert.strictEqual(vscodeMock.window.showWarningMessage.callCount, 0);
    assert.strictEqual(vscodeMock.workspace.findFiles.callCount, 0);
    assert.deepStrictEqual(published(suitePath), []);
    assert.strictEqual(vscodeMock.env.clipboard.writeText.callCount, 0);
  });

  test('[F29-FR-10] a single case is reported in the singular', async () => {
    open(write('one.schema.test.json', { schema: 'person.schema.json', valid: [{ name: 'Ada' }] }));
    await run();
    assert.strictEqual(vscodeMock.window.showInformationMessage.firstCall.args[0], '✓ 1/1 schema test case passed.');
  });

  test('[F29-FR-11] failures warn, land on the failing case, and replace the previous run', async () => {
    const suitePath = write('person.schema.test.json', {
      schema: './person.schema.json',
      valid: [{ name: 'Ada' }, { name: 2 }],
    });
    open(suitePath);
    await run();
    assert.strictEqual(vscodeMock.window.showWarningMessage.firstCall.args[0], '✗ 1/2 schema test cases passed.');
    assert.strictEqual(vscodeMock.window.showWarningMessage.firstCall.args[1], 'Copy report');
    assert.strictEqual(vscodeMock.window.showInformationMessage.callCount, 0);
    assert.strictEqual(collection.clear.callCount, 1);
    assert.ok(collection.clear.calledBefore(collection.set));
    const diagnostics = published(suitePath);
    assert.strictEqual(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /^valid\[1\]: /);
    // The failing case is the second entry of `valid`, on the suite's 7th line.
    const text = fs.readFileSync(suitePath, 'utf-8');
    assert.strictEqual(diagnostics[0].range.start.line, text.slice(0, text.indexOf('"name": 2')).split('\n').length - 2);
  });

  test('[F29-FR-11] "Copy report" puts every suite\'s report on the clipboard', async () => {
    const suitePath = write('person.schema.test.json', { schema: './person.schema.json', valid: [{ name: 2 }] });
    open(suitePath);
    vscodeMock.window.showWarningMessage.resolves('Copy report');
    await run();
    const copied: string = vscodeMock.env.clipboard.writeText.firstCall.args[0];
    assert.match(copied, /^# Schema tests — person\.schema\.test\.json\n/);
    assert.match(copied, /\*\*0 \/ 1 cases passed\.\*\*/);
  });

  test('[F29-FR-11] a passing run can copy its report too', async () => {
    open(write('person.schema.test.json', { schema: './person.schema.json', valid: [{ name: 'Ada' }] }));
    vscodeMock.window.showInformationMessage.resolves('Copy report');
    await run();
    assert.match(vscodeMock.env.clipboard.writeText.firstCall.args[0], /Every case passed/);
  });

  test('[F29-FR-10] an active schema runs every suite that declares it, and only those', async () => {
    const guarding = write('tests/person.schema.test.json', { schema: '../person.schema.json', valid: [{ name: 'Ada' }] });
    const alsoGuarding = write('more.schema.test.json', { schema: 'person.schema.json', invalid: [{}] });
    write('other.schema.json', { type: 'string' });
    const unrelated = write('other.schema.test.json', { schema: './other.schema.json', valid: ['x'] });
    const broken = write('broken.schema.test.json', '{ not json');
    vscodeMock.workspace.findFiles.resolves([guarding, unrelated, broken, alsoGuarding].map(p => vscodeMock.Uri.file(p)));
    open(path.join(root, 'person.schema.json'));
    await run();
    assert.deepStrictEqual(vscodeMock.workspace.findFiles.firstCall.args, ['**/*.schema.test.json', '**/node_modules/**', 200]);
    assert.deepStrictEqual(collection.set.getCalls().map(c => c.args[0].fsPath), [guarding, alsoGuarding]);
    assert.strictEqual(vscodeMock.window.showInformationMessage.firstCall.args[0], '✓ 2/2 schema test cases passed.');
    assert.strictEqual(vscodeMock.window.showWarningMessage.callCount, 0);
  });

  test('[F29-FR-10] an active schema with no guarding suite says how to create one', async () => {
    open(path.join(root, 'person.schema.json'));
    await run();
    assert.strictEqual(vscodeMock.workspace.findFiles.callCount, 1);
    assert.match(vscodeMock.window.showInformationMessage.firstCall.args[0], /Create a \*\.schema\.test\.json file next to the schema/);
    assert.strictEqual(collection.clear.callCount, 0);
  });

  test('[F29-FR-08] a case file is read relative to the suite and parsed by its format', async () => {
    write('fixtures/ada.yaml', 'name: Ada\n');
    write('fixtures/bad.json', { name: 7 });
    const suitePath = write('tests/person.schema.test.json', {
      schema: '../person.schema.json',
      valid: [{ file: '../fixtures/ada.yaml' }],
      invalid: [{ file: '../fixtures/bad.json', errors: ['type'] }],
    });
    open(suitePath);
    await run();
    assert.strictEqual(vscodeMock.window.showInformationMessage.firstCall.args[0], '✓ 2/2 schema test cases passed.');
  });

  test('[F29-FR-14] a case file outside the workspace fails that case and is never read', async () => {
    const secret = write('secret.json', { name: 'leaked-value' }, outside);
    const suitePath = write('person.schema.test.json', {
      schema: './person.schema.json',
      valid: [{ name: 'Ada' }, { file: path.relative(root, secret) }, { file: secret }],
    });
    open(suitePath);
    await run();
    assert.strictEqual(vscodeMock.window.showWarningMessage.firstCall.args[0], '✗ 1/3 schema test cases passed.');
    const diagnostics = published(suitePath);
    assert.strictEqual(diagnostics.length, 2);
    for (const d of diagnostics) {
      assert.match(d.message, /resolves outside the workspace and was not read/);
      assert.doesNotMatch(d.message, /leaked-value/);
    }
  });

  test('[F29-FR-14] a case file is refused when the suite is in no workspace folder', async () => {
    write('person.schema.json', SCHEMA, outside);
    write('ada.json', { name: 'Ada' }, outside);
    vscodeMock.workspace.getWorkspaceFolder.returns(undefined);
    open(write('person.schema.test.json', { schema: './person.schema.json', valid: [{ file: 'ada.json' }] }, outside));
    await run();
    // With no folder there is no root to confine to, so the schema is refused
    // before any case could be.
    assert.match(vscodeMock.window.showWarningMessage.firstCall.args[0], /resolves outside the workspace and was not read/);
    assert.strictEqual(collection.set.callCount, 0);
  });

  test('[F29-FR-14] a schema outside the workspace is refused, reported, and nothing is summarised', async () => {
    const secret = write('secret.schema.json', SCHEMA, outside);
    const ref = path.relative(root, secret);
    open(write('person.schema.test.json', { schema: ref, valid: [{ name: 'Ada' }] }));
    await run();
    assert.strictEqual(vscodeMock.window.showWarningMessage.callCount, 1);
    assert.strictEqual(
      vscodeMock.window.showWarningMessage.firstCall.args[0],
      `person.schema.test.json: "${ref}" resolves outside the workspace and was not read.`,
    );
    assert.strictEqual(vscodeMock.window.showInformationMessage.callCount, 0);
    assert.strictEqual(collection.set.callCount, 0);
    // Only the suite itself was read — never the schema it pointed at.
    assert.deepStrictEqual(vscodeMock.workspace.fs.readFile.getCalls().map(c => path.basename(c.args[0].fsPath)), ['person.schema.test.json']);
  });

  test('[F29-NFR-02] a remote schema is refused without fetching', async () => {
    for (const ref of ['https://example.test/person.schema.json', 'http://example.test/person.schema.json']) {
      vscodeMock.window.showWarningMessage.resetHistory();
      open(write('person.schema.test.json', { schema: ref, valid: [{ name: 'Ada' }] }));
      await run();
      assert.strictEqual(
        vscodeMock.window.showWarningMessage.firstCall.args[0],
        `person.schema.test.json: remote schema "${ref}" — cache it locally first.`,
      );
    }
    assert.strictEqual(collection.set.callCount, 0);
  });

  test('[F29-NFR-02] a relative path that merely contains a URL is not treated as remote', async () => {
    open(write('person.schema.test.json', { schema: './xhttp://person.schema.json', valid: [{ name: 'Ada' }] }));
    await run();
    assert.match(vscodeMock.window.showWarningMessage.firstCall.args[0], /cannot load ".\/xhttp:\/\/person\.schema\.json"/);
  });

  test('[F29-FR-04] a malformed suite reports every problem, prefixed with its file name', async () => {
    open(write('person.schema.test.json', { valid: 'nope' }));
    await run();
    const message: string = vscodeMock.window.showWarningMessage.firstCall.args[0];
    assert.match(message, /^person\.schema\.test\.json: /);
    assert.match(message, /"schema"/);
    assert.match(message, /\. .*valid/s);
    assert.strictEqual(collection.set.callCount, 0);
  });

  test('[F29-FR-10] an unreadable suite, a missing schema and an unparsable schema are each reported', async () => {
    const unreadable = write('a.schema.test.json', '{ "schema": ');
    const missing = write('b.schema.test.json', { schema: './gone.schema.json', valid: [1] });
    write('broken.schema.yaml', 'a: [1, 2\nb: }');
    const unparsable = write('c.schema.test.json', { schema: './broken.schema.yaml', valid: [1] });
    const good = write('d.schema.test.json', { schema: './person.schema.json', valid: [{ name: 'Ada' }] });
    vscodeMock.workspace.findFiles.resolves([good].map(p => vscodeMock.Uri.file(p)));

    const messages: string[] = [];
    for (const suitePath of [unreadable, missing, unparsable]) {
      vscodeMock.window.showWarningMessage.resetHistory();
      open(suitePath);
      await run();
      assert.strictEqual(vscodeMock.window.showWarningMessage.callCount, 1);
      messages.push(vscodeMock.window.showWarningMessage.firstCall.args[0]);
    }
    assert.match(messages[0], /^Cannot read a\.schema\.test\.json: /);
    assert.match(messages[1], /^b\.schema\.test\.json: cannot load "\.\/gone\.schema\.json" — /);
    assert.strictEqual(messages[2], 'c.schema.test.json: cannot load "./broken.schema.yaml" — the schema does not parse');
    assert.strictEqual(collection.set.callCount, 0);
    assert.strictEqual(vscodeMock.window.showInformationMessage.callCount, 0);
  });
});

suite('[F29-FR-11] suiteDiagnostics — positions and labels', () => {
  const TEXT = '{\n  "schema": "s.json",\n  "valid": [\n    1,\n      {"a": 2}\n  ]\n}\n';

  function failing(pointer: string, message?: string) {
    return { total: 1, passed: 0, failed: 1, cases: [{ name: 'case', expect: 'valid', passed: false, pointer, message }] };
  }

  test('the range spans the failing case exactly, on its own line and column', () => {
    const [d] = suiteDiagnostics(TEXT, failing('/valid/1', 'boom'));
    assert.deepStrictEqual(
      [d.range.start.line, d.range.start.character, d.range.end.line, d.range.end.character],
      [4, 6, 4, 14],
    );
    assert.strictEqual(d.message, 'case: boom');
    assert.strictEqual(d.severity, vscodeMock.DiagnosticSeverity.Error);
    assert.strictEqual(d.source, 'jsonschema');
    assert.strictEqual(d.code, 'schema-test');
  });

  test('a case on the first line is positioned from the start of the text', () => {
    const [d] = suiteDiagnostics('{"valid": [7]}', failing('/valid/0'));
    assert.deepStrictEqual([d.range.start.line, d.range.start.character, d.range.end.character], [0, 11, 12]);
    assert.strictEqual(d.message, 'case: failed');
  });

  test('a pointer that no longer resolves falls back to the first character', () => {
    const [d] = suiteDiagnostics(TEXT, failing('/valid/9'));
    assert.deepStrictEqual(
      [d.range.start.line, d.range.start.character, d.range.end.line, d.range.end.character],
      [0, 0, 0, 1],
    );
  });
});
