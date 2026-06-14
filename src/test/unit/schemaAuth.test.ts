import * as assert from 'assert';
import * as vscode from '../mocks/vscode';

const { SchemaAuthManager, AuthRequiredError } = require('../../SchemaAuthManager');
const { extractSchemaUrlFromLine }             = require('../../SchemaAuthCodeActionProvider');
const { extractInlineSchemaUrl }               = require('../../SchemaBindingManager');

// ─── SchemaAuthManager static utilities ───────────────────────────────────────

suite('SchemaAuthManager.isRemoteUrl()', () => {
  test('true for https', () => assert.ok(SchemaAuthManager.isRemoteUrl('https://example.com/schema.json')));
  test('true for http',  () => assert.ok(SchemaAuthManager.isRemoteUrl('http://example.com/schema.json')));
  test('false for file path',       () => assert.ok(!SchemaAuthManager.isRemoteUrl('/local/schema.json')));
  test('false for relative path',   () => assert.ok(!SchemaAuthManager.isRemoteUrl('./schema.json')));
  test('false for empty string',    () => assert.ok(!SchemaAuthManager.isRemoteUrl('')));
});

suite('SchemaAuthManager.isGitHubUrl()', () => {
  test('raw.githubusercontent.com', () => assert.ok(SchemaAuthManager.isGitHubUrl('https://raw.githubusercontent.com/user/repo/main/schema.json')));
  test('api.github.com',            () => assert.ok(SchemaAuthManager.isGitHubUrl('https://api.github.com/repos/user/repo')));
  test('subdomain.github.com',      () => assert.ok(SchemaAuthManager.isGitHubUrl('https://gist.github.com/user/abc')));
  test('false for other host',      () => assert.ok(!SchemaAuthManager.isGitHubUrl('https://artifactory.corp.com/schema.json')));
  test('false for invalid url',     () => assert.ok(!SchemaAuthManager.isGitHubUrl('not a url')));
});

suite('SchemaAuthManager.hostOf()', () => {
  test('extracts hostname',        () => assert.strictEqual(SchemaAuthManager.hostOf('https://example.com/path'), 'example.com'));
  test('extracts with port',       () => assert.strictEqual(SchemaAuthManager.hostOf('https://corp.com:8443/schema'), 'corp.com'));
  test('returns input on error',   () => assert.strictEqual(SchemaAuthManager.hostOf('not-a-url'), 'not-a-url'));
});

// ─── AuthRequiredError ────────────────────────────────────────────────────────

suite('AuthRequiredError', () => {
  test('name is AuthRequiredError', () => {
    const e = new AuthRequiredError('https://example.com/schema.json', 401);
    assert.strictEqual(e.name, 'AuthRequiredError');
  });
  test('stores url and status', () => {
    const e = new AuthRequiredError('https://corp.com/s.json', 403);
    assert.strictEqual(e.url, 'https://corp.com/s.json');
    assert.strictEqual(e.status, 403);
  });
  test('instanceof Error', () => {
    assert.ok(new AuthRequiredError('https://x.com', 401) instanceof Error);
  });
});

// ─── extractSchemaUrlFromLine ─────────────────────────────────────────────────

function makeLine(text: string) {
  return {
    lineAt: (_: number) => ({ text }),
    languageId: 'json',
  };
}

suite('extractSchemaUrlFromLine()', () => {
  test('extracts from JSON "$schema" property', () => {
    const url = 'https://json.schemastore.org/package.json';
    const doc = makeLine(`  "$schema": "${url}"`);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), url);
  });

  test('extracts from YAML comment directive', () => {
    const url = 'https://raw.githubusercontent.com/org/repo/main/schema.json';
    const doc = makeLine(`# yaml-language-server: $schema=${url}`);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), url);
  });

  test('extracts from YAML inline $schema', () => {
    const url = 'https://example.com/schema.json';
    const doc = makeLine(`$schema: ${url}`);
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), url);
  });

  test('returns undefined for non-schema line', () => {
    const doc = makeLine('  "name": "my-package"');
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), undefined);
  });

  test('returns undefined for local file path in $schema', () => {
    const doc = makeLine('  "$schema": "./my-schema.json"');
    assert.strictEqual(extractSchemaUrlFromLine(doc, 0), undefined);
  });
});

// ─── extractInlineSchemaUrl ───────────────────────────────────────────────────

function makeDoc(languageId: string, text: string) {
  return { languageId, getText: () => text };
}

suite('extractInlineSchemaUrl()', () => {
  test('extracts $schema from JSON', () => {
    const url = 'https://json.schemastore.org/package.json';
    const doc = makeDoc('json', JSON.stringify({ $schema: url }));
    assert.strictEqual(extractInlineSchemaUrl(doc), url);
  });

  test('returns undefined for JSON without $schema', () => {
    const doc = makeDoc('json', JSON.stringify({ name: 'test' }));
    assert.strictEqual(extractInlineSchemaUrl(doc), undefined);
  });

  test('returns undefined for invalid JSON', () => {
    const doc = makeDoc('json', 'not valid json {');
    assert.strictEqual(extractInlineSchemaUrl(doc), undefined);
  });

  test('extracts $schema from YAML inline key', () => {
    const url = 'https://example.com/schema.json';
    const doc = makeDoc('yaml', `$schema: ${url}\nname: test`);
    assert.strictEqual(extractInlineSchemaUrl(doc), url);
  });

  test('extracts from yaml-language-server directive', () => {
    const url = 'https://raw.githubusercontent.com/org/repo/main/schema.json';
    const doc = makeDoc('yaml', `# yaml-language-server: $schema=${url}\nname: test`);
    assert.strictEqual(extractInlineSchemaUrl(doc), url);
  });

  test('returns undefined for YAML without $schema', () => {
    const doc = makeDoc('yaml', 'name: test\nversion: 1.0');
    assert.strictEqual(extractInlineSchemaUrl(doc), undefined);
  });

  test('returns undefined for empty document', () => {
    const doc = makeDoc('json', '');
    assert.strictEqual(extractInlineSchemaUrl(doc), undefined);
  });

  test('handles jsonc language id', () => {
    const url = 'https://example.com/schema.json';
    // JSONC with a comment followed by JSON content
    const doc = makeDoc('jsonc', `{ "$schema": "${url}" }`);
    assert.strictEqual(extractInlineSchemaUrl(doc), url);
  });
});
