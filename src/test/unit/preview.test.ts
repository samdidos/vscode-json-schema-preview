import * as assert from 'assert';
import * as vscode from '../mocks/vscode';

const { isJsonSchemaFile, findConfigFile, CONFIG_FILENAME } = require('../../PreviewWebPanel');

suite('isJsonSchemaFile()', () => {
  setup(() => vscode.resetAll());

  test('returns false for undefined', () => {
    assert.strictEqual(isJsonSchemaFile(undefined), false);
  });

  test('returns true for JSON with $schema', () => {
    const doc = { languageId: 'json', getText: () => '{"$schema":"http://json-schema.org/draft-07/schema#"}' };
    assert.strictEqual(isJsonSchemaFile(doc), true);
  });

  test('returns false for JSON without $schema', () => {
    const doc = { languageId: 'json', getText: () => '{"title":"plain data"}' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns false for invalid JSON', () => {
    const doc = { languageId: 'json', getText: () => '{ not valid' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns true for YAML with $schema on first line', () => {
    const doc = { languageId: 'yaml', getText: () => '$schema: http://json-schema.org/draft-07/schema#\ntitle: test' };
    assert.strictEqual(isJsonSchemaFile(doc), true);
  });

  test('returns true for YAML with $schema mid-file', () => {
    const doc = { languageId: 'yaml', getText: () => 'title: test\n$schema: http://json-schema.org/draft-07/schema#' };
    assert.strictEqual(isJsonSchemaFile(doc), true);
  });

  test('returns false for YAML without $schema', () => {
    const doc = { languageId: 'yaml', getText: () => 'title: no schema\ntype: object' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns true for yml languageId', () => {
    const doc = { languageId: 'yml', getText: () => '$schema: http://json-schema.org/draft-07/schema#' };
    assert.strictEqual(isJsonSchemaFile(doc), true);
  });

  test('returns false for plaintext', () => {
    const doc = { languageId: 'plaintext', getText: () => 'hello' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns false for typescript', () => {
    const doc = { languageId: 'typescript', getText: () => 'const x = 1;' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });
});

suite('CONFIG_FILENAME', () => {
  test('equals expected constant', () => {
    assert.strictEqual(CONFIG_FILENAME, '.json-schema-preview-config.json');
  });
});

suite('findConfigFile()', () => {
  setup(() => vscode.resetAll());

  test('returns undefined when no workspace folders', () => {
    vscode.workspace.workspaceFolders = undefined;
    assert.strictEqual(findConfigFile(), undefined);
  });

  test('returns undefined when workspace has no config file on disk', () => {
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/nonexistent-workspace-xyz' } }];
    assert.strictEqual(findConfigFile(), undefined);
  });

  test('returns path when config file exists', () => {
    const fs  = require('fs');
    const os  = require('os');
    const pth = require('path');
    const tmp = fs.mkdtempSync(pth.join(os.tmpdir(), 'jspreview-'));
    const cfg = pth.join(tmp, CONFIG_FILENAME);
    fs.writeFileSync(cfg, '{}');
    try {
      vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmp } }];
      assert.strictEqual(findConfigFile(), cfg);
    } finally {
      fs.unlinkSync(cfg);
      fs.rmdirSync(tmp);
    }
  });

  test('skips folders without config and returns first match', () => {
    const fs  = require('fs');
    const os  = require('os');
    const pth = require('path');
    const tmp = fs.mkdtempSync(pth.join(os.tmpdir(), 'jspreview-'));
    const cfg = pth.join(tmp, CONFIG_FILENAME);
    fs.writeFileSync(cfg, '{}');
    try {
      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: '/nonexistent-abc' } },
        { uri: { fsPath: tmp } },
      ];
      assert.strictEqual(findConfigFile(), cfg);
    } finally {
      fs.unlinkSync(cfg);
      fs.rmdirSync(tmp);
    }
  });
});
