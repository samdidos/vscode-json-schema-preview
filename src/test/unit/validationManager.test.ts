import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';
import { setConfig } from '../mocks/vscode';

const { validateCurrentFile, validationDiagnostics } = require('../../ValidationManager');
const { HttpError } = require('../../reliability');

function positionAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
}

function makeDoc(languageId: string, text: string, fsPath = '/ws/data.json') {
  return {
    languageId,
    getText: () => text,
    uri: { fsPath },
    positionAt: (offset: number) => positionAt(text, offset),
  };
}

function fakeAuth(impl: (url: string) => Promise<string>) {
  return { fetchText: async (url: string) => impl(url) };
}

let tmpDir: string;

setup(() => {
  vscode.resetAll();
  validationDiagnostics.set.resetHistory();
  validationDiagnostics.delete.resetHistory();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-validate-test-'));
});

teardown(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function activate(doc: any) {
  vscode.window.activeTextEditor = { document: doc };
}

// ── Entry gating ───────────────────────────────────────────────────────────────

suite('[F03-FR-01] validateCurrentFile() — entry gating', () => {
  test('shows an info message when there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showInformationMessage.calledWith('Open a JSON or YAML file to validate.'));
  });

  test('[F03-FR-02][F11-FR-07] shows an info message for an unsupported language', async () => {
    activate(makeDoc('typescript', 'const x = 1;'));
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showInformationMessage.calledWith(
      'Validation supports JSON, JSONC, JSONL, YAML, and TOML files.',
    ));
  });

  test('[F03-FR-03] warns and offers Bind Schema when nothing is bound', async () => {
    activate(makeDoc('json', '{"name":"Alice"}'));
    vscode.window.showWarningMessage.resolves(undefined);
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showWarningMessage.calledWithMatch(/No schema bound to data\.json/));
    assert.ok(!vscode.commands.executeCommand.called);
  });

  test('clicking "Bind Schema" runs the bind command', async () => {
    activate(makeDoc('json', '{"name":"Alice"}'));
    vscode.window.showWarningMessage.resolves('Bind Schema');
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.commands.executeCommand.calledWith('jsonschema.bindToCurrentFile'));
  });
});

// ── Schema loading failures ───────────────────────────────────────────────────

suite('[F03-FR-04] validateCurrentFile() — schema load failures', () => {
  test('[F07-FR-12] an AuthRequiredError offers Configure Auth', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}');
    activate(doc);
    const { AuthRequiredError } = require('../../SchemaAuthManager');
    vscode.window.showErrorMessage.resolves('Configure Auth');
    await validateCurrentFile(fakeAuth(async () => { throw new AuthRequiredError('https://example.com/s.json', 401); }) as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/requires authentication \(HTTP 401\)/));
    assert.ok(vscode.commands.executeCommand.calledWith('jsonschema.configureSchemaAuth', 'https://example.com/s.json'));
  });

  test('dismissing the auth-required prompt runs no command', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}');
    activate(doc);
    const { AuthRequiredError } = require('../../SchemaAuthManager');
    vscode.window.showErrorMessage.resolves(undefined);
    await validateCurrentFile(fakeAuth(async () => { throw new AuthRequiredError('https://example.com/s.json', 401); }) as any)();
    assert.ok(!vscode.commands.executeCommand.called);
  });

  test('a 404 with no cache shows a plain load error, not a fallback', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}');
    activate(doc);
    await validateCurrentFile(fakeAuth(async () => { throw new HttpError(404, 'HTTP 404'); }) as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot load schema "s\.json"/));
  });

  test('[S04-SR-01][S04-SR-02] a transient failure falls back to a cached copy and warns', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}');
    activate(doc);
    const cache = { readCached: () => '{"type":"object","properties":{"name":{"type":"string"}}}' };
    await validateCurrentFile(
      fakeAuth(async () => { throw new HttpError(503, 'HTTP 503'); }) as any,
      cache as any,
    )();
    assert.ok(vscode.window.showWarningMessage.calledWithMatch(/is unreachable — validating against the last cached copy/));
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/is valid against/));
  });

  test('[S04-SR-03] a transient failure with nothing cached surfaces the load error', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}');
    activate(doc);
    const cache = { readCached: () => undefined };
    await validateCurrentFile(
      fakeAuth(async () => { throw new HttpError(503, 'HTTP 503'); }) as any,
      cache as any,
    )();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot load schema/));
  });

  test('a local schema file that does not exist shows a load error', async () => {
    setConfig('json', 'schemas', [{ url: path.join(tmpDir, 'missing.json'), fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    activate(makeDoc('json', '{"name":"Alice"}'));
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot load schema "missing\.json"/));
  });
});

// ── Data parse failures ────────────────────────────────────────────────────────

suite('[F03-FR-05] validateCurrentFile() — data parse failures', () => {
  test('invalid JSON data shows a parse error', async () => {
    const schemaFile = path.join(tmpDir, 's.json');
    fs.writeFileSync(schemaFile, '{"type":"object"}');
    setConfig('json', 'schemas', [{ url: schemaFile, fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    activate(makeDoc('json', '{not valid json'));
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot parse data\.json/));
  });
});

// ── TOML validation (F11-FR-06) ─────────────────────────────────────────────────

suite('[F11-FR-06] validateCurrentFile() — TOML', () => {
  const tomlUri = 'https://example.com/s.json';

  test('validates a valid TOML file against its inline $schema', async () => {
    const doc = makeDoc('toml', `"$schema" = "${tomlUri}"\nname = "Alice"\n`, '/ws/config.toml');
    activate(doc);
    vscode.workspace.asRelativePath.callsFake(() => 'config.toml');
    const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/✓ config\.toml is valid/));
  });

  test('[F11-AC-8] treats TOML native dates as strings so date fields validate', async () => {
    const doc = makeDoc('toml', `"$schema" = "${tomlUri}"\ncreated = 2020-01-02T03:04:05Z\n`, '/ws/config.toml');
    activate(doc);
    vscode.workspace.asRelativePath.callsFake(() => 'config.toml');
    const schema = { type: 'object', properties: { created: { type: 'string' } } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/is valid/));
  });

  test('reports invalid TOML data as a parse error', async () => {
    const doc = makeDoc('toml', `"$schema" = "${tomlUri}"\nbroken = = =\n`, '/ws/config.toml');
    activate(doc);
    vscode.workspace.asRelativePath.callsFake(() => 'config.toml');
    await validateCurrentFile(fakeAuth(async () => '{"type":"object"}') as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot parse config\.toml/));
  });

  test('[F11-FR-08] sets diagnostics when TOML data violates the schema', async () => {
    const doc = makeDoc('toml', `"$schema" = "${tomlUri}"\nname = 5\n`, '/ws/config.toml');
    activate(doc);
    vscode.workspace.asRelativePath.callsFake(() => 'config.toml');
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(validationDiagnostics.set.calledWith(doc.uri));
  });
});

// ── Schema compile failures ─────────────────────────────────────────────────────

suite('validateCurrentFile() — schema compile failures', () => {
  test('an invalid schema shows a compile error', async () => {
    const schemaFile = path.join(tmpDir, 's.json');
    fs.writeFileSync(schemaFile, '{"type":"not-a-real-type"}');
    setConfig('json', 'schemas', [{ url: schemaFile, fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    activate(makeDoc('json', '{"name":"Alice"}'));
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/Cannot compile schema/));
  });
});

// ── Successful validation ───────────────────────────────────────────────────────

suite('[F03-FR-06][F03-FR-07] validateCurrentFile() — validation outcomes', () => {
  test('shows a success message when the data is valid', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}');
    activate(doc);
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/✓ data\.json is valid against s\.json/));
    assert.ok(!validationDiagnostics.set.called);
  });

  test('[F03-FR-08] sets diagnostics and shows an error count when invalid', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":123}');
    activate(doc);
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/✗ 1 validation error in data\.json/));
    assert.ok(validationDiagnostics.set.calledWith(doc.uri));
    const diags = validationDiagnostics.set.firstCall.args[1];
    assert.strictEqual(diags.length, 1);
    assert.match(diags[0].message, /\/name:/);
  });

  test('[F03-FR-09] clears prior diagnostics before re-validating', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}');
    activate(doc);
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(validationDiagnostics.delete.calledWith(doc.uri));
  });

  test('pluralises the error count message for multiple errors', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json","name":123,"age":"old"}');
    activate(doc);
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
    };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/✗ 2 validation errors in data\.json/));
  });

  test('locates the diagnostic range at the offending key', async () => {
    const text = '{"$schema":"https://example.com/s.json",\n  "name": 123\n}';
    const doc = makeDoc('json', text);
    activate(doc);
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    const diags = validationDiagnostics.set.firstCall.args[1];
    assert.strictEqual(diags[0].range.startLine, 1);
  });

  test('falls back to a (0,0)-(0,0) range for a purely numeric (array-index) instancePath', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json"}\n[1,2,"x"]'.split('\n')[1], '/ws/data.json');
    activate(doc);
    // Bind externally since the data root is an array and has no room for $schema.
    setConfig('json', 'schemas', [{ url: 'https://example.com/s.json', fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    const schema = { type: 'array', items: { type: 'number' } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    const diags = validationDiagnostics.set.firstCall.args[1];
    assert.strictEqual(diags[0].range.startLine, 0);
    assert.strictEqual(diags[0].range.startChar, 0);
    assert.strictEqual(diags[0].range.endLine, 0);
    assert.strictEqual(diags[0].range.endChar, 0);
  });

  test('falls back to a (0,0)-(0,0) range for a root-level error', async () => {
    const doc = makeDoc('json', '{"$schema":"https://example.com/s.json"}');
    activate(doc);
    const schema = { type: 'object', required: ['name'] };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    const diags = validationDiagnostics.set.firstCall.args[1];
    assert.strictEqual(diags[0].range.startLine, 0);
    assert.strictEqual(diags[0].range.startChar, 0);
  });
});

// ── Data format handling ────────────────────────────────────────────────────────

suite('[F03-FR-10][F03-FR-11][F03-FR-12] validateCurrentFile() — data formats', () => {
  const objSchema = { type: 'object', properties: { name: { type: 'string' } } };

  test('validates a YAML document', async () => {
    activate(makeDoc('yaml', '$schema: https://example.com/s.json\nname: Alice\n'));
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(objSchema)) as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/is valid/));
  });

  test('validates a JSONC document with comments stripped', async () => {
    activate(makeDoc('jsonc', '// leading comment\n{"$schema":"https://example.com/s.json","name":"Alice"}'));
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(objSchema)) as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/is valid/));
  });

  test('[F03-FR-13] validates each line of a JSONL document independently', async () => {
    setConfig('json', 'schemas', [{ url: 'https://example.com/s.json', fileMatch: ['data.jsonl'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.jsonl');
    activate(makeDoc('jsonl', '{"name":"Alice"}\n{"name":42}', '/ws/data.jsonl'));
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(objSchema)) as any)();
    const diags = validationDiagnostics.set.firstCall.args[1];
    // Only the second line (name: 42) is invalid.
    assert.strictEqual(diags.length, 1);
  });
});

// ── Remote / local schema resolution ────────────────────────────────────────────

suite('validateCurrentFile() — schema path resolution', () => {
  test('loads a local schema resolved relative to the workspace folder', async () => {
    const schemaFile = path.join(tmpDir, 's.json');
    fs.writeFileSync(schemaFile, '{"type":"object","properties":{"name":{"type":"string"}}}');
    setConfig('json', 'schemas', [{ url: './s.json', fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: tmpDir } });
    activate(makeDoc('json', '{"name":"Alice"}'));
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/is valid/));
  });

  test('loads a local schema referenced by a file:// URI', async () => {
    const schemaFile = path.join(tmpDir, 's.json');
    fs.writeFileSync(schemaFile, '{"type":"object","properties":{"name":{"type":"string"}}}');
    setConfig('json', 'schemas', [{ url: `file://${schemaFile}`, fileMatch: ['data.json'] }]);
    vscode.workspace.asRelativePath.callsFake(() => 'data.json');
    activate(makeDoc('json', '{"name":"Alice"}'));
    await validateCurrentFile(fakeAuth(async () => '{}') as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/is valid/));
  });

  test('[F04-FR-04] an inline $schema is used when no external binding exists', async () => {
    activate(makeDoc('json', '{"$schema":"https://example.com/s.json","name":"Alice"}'));
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    await validateCurrentFile(fakeAuth(async () => JSON.stringify(schema)) as any)();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/is valid against s\.json/));
  });
});
