// Mutation-hardening tests for extension.ts. The existing suite checks that
// things were *called*; these assert *what was produced* — the inferred schema
// content and the exact auto-preview gating — so flipped conditions and mutated
// literals fail a test instead of surviving.
import * as assert from 'assert';
import * as vscode from '../mocks/vscode';

const ext = require('../../extension');

function makeContext(): any {
  return {
    subscriptions: [],
    secrets: {
      get: () => Promise.resolve(undefined),
      store: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    },
  };
}

function handlerFor(id: string): (...args: any[]) => any {
  const call = (vscode.commands.registerCommand.args as any[][]).find(([cmd]) => cmd === id);
  if (!call) { throw new Error(`command not registered: ${id}`); }
  return call[1];
}

suite('extension — inferSchema produces the right schema', () => {
  setup(() => {
    vscode.resetAll();
    ext.activate(makeContext());
  });

  function inferredSchemaFrom(languageId: string, text: string) {
    vscode.window.activeTextEditor = { document: { languageId, getText: () => text, uri: { fsPath: `/ws/d.${languageId}` } } } as any;
    return handlerFor('jsonschema.inferSchema')().then(() => {
      const arg = vscode.workspace.openTextDocument.firstCall.args[0];
      return { arg, schema: JSON.parse(arg.content) };
    });
  }

  test('JSON: injects the draft-07 $schema and opens as a json document', async () => {
    const { arg, schema } = await inferredSchemaFrom('json', '{"name":"Alice","age":30}');
    assert.strictEqual(arg.language, 'json');
    assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.strictEqual(schema.properties.name.type, 'string');
    assert.ok(['integer', 'number'].includes(schema.properties.age.type));
  });

  test('YAML is parsed as YAML into the schema', async () => {
    const { schema } = await inferredSchemaFrom('yaml', 'name: Alice\nage: 30');
    assert.strictEqual(schema.properties.name.type, 'string');
  });

  test('JSONL is parsed line-by-line into an array schema', async () => {
    const { schema } = await inferredSchemaFrom('jsonl', '{"a":1}\n{"a":2}');
    assert.strictEqual(schema.type, 'array');
  });

  test('JSONC comments are stripped before inference', async () => {
    const { schema } = await inferredSchemaFrom('jsonc', '// header\n{"name":"Bob"}');
    assert.strictEqual(schema.properties.name.type, 'string');
  });
});

suite('extension — maybeAutoPreview gating', () => {
  function activateWith(languageId: string, text: string, scheme: string, autoOpen: boolean) {
    vscode.resetAll();
    vscode.setConfig('jsonschema.preview', 'autoOpen', autoOpen);
    vscode.window.activeTextEditor = {
      document: { languageId, getText: () => text, uri: { fsPath: `/ws/f.${languageId}`, scheme } },
    } as any;
    ext.activate(makeContext());
  }
  const schemaJson = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' });

  test('opens a schema file when autoOpen=true', () => {
    activateWith('json', schemaJson, 'file', true);
    assert.ok(vscode.window.createWebviewPanel.called);
  });

  test('does NOT open when autoOpen=false, even for a schema file', () => {
    activateWith('json', schemaJson, 'file', false);
    assert.ok(!vscode.window.createWebviewPanel.called);
  });

  test('does NOT open a non-schema file even when autoOpen=true', () => {
    activateWith('json', '{"plain":"data"}', 'file', true);
    assert.ok(!vscode.window.createWebviewPanel.called);
  });

  test('does NOT open an untitled schema buffer when autoOpen=true', () => {
    activateWith('json', schemaJson, 'untitled', true);
    assert.ok(!vscode.window.createWebviewPanel.called);
  });
});
