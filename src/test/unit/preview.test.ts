import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from '../mocks/vscode';

const {
  isJsonSchemaFile, findConfigFile, CONFIG_FILENAME, getSettingsConfig, resolveConfigSource,
  syncPreviewScroll, openJsonSchemaFiles,
} = require('../../PreviewWebPanel');

suite('[F01-FR-02] isJsonSchemaFile()', () => {
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

  test('returns false for a data file whose $schema points at a schema path (inline binding)', () => {
    const doc = { languageId: 'json', getText: () => '{"$schema":"./schemas/person.schema.json","name":"Alice"}' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns false for a data file whose $schema is a remote non-meta-schema URL', () => {
    const doc = { languageId: 'json', getText: () => '{"$schema":"https://vega.github.io/schema/vega-lite/v5.json"}' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns true for a schema using an unversioned json-schema.org $schema', () => {
    const doc = { languageId: 'json', getText: () => '{"$schema":"http://json-schema.org/schema#","type":"object"}' };
    assert.strictEqual(isJsonSchemaFile(doc), true);
  });

  test('returns false for a $schema whose host merely contains json-schema.org as a substring (lookalike domain)', () => {
    const doc = { languageId: 'json', getText: () => '{"$schema":"https://json-schema.org.evil.com/draft-07/schema#"}' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns false for a $schema where json-schema.org only appears in the path/query, not the host', () => {
    const doc = { languageId: 'json', getText: () => '{"$schema":"https://evil.com/?x=json-schema.org"}' };
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

  test('returns false for YAML whose $schema points at a schema path (inline binding)', () => {
    const doc = { languageId: 'yaml', getText: () => '$schema: ./schemas/person.schema.json\nname: Alice' };
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns true for YAML with a quoted json-schema.org $schema value', () => {
    const doc = { languageId: 'yaml', getText: () => '$schema: "http://json-schema.org/draft-07/schema#"\ntitle: test' };
    assert.strictEqual(isJsonSchemaFile(doc), true);
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

suite('[F01-FR-10] findConfigFile()', () => {
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

// json-schema-for-humans config keys are snake_case (external wire format);
// parsed from JSON rather than written as object literals to avoid tripping
// the naming-convention lint rule on ordinary test fixtures.
const mdTemplateConfig: Record<string, unknown> = JSON.parse('{"template_name":"md"}');

suite('[F09-FR-12] getSettingsConfig()', () => {
  setup(() => vscode.resetAll());

  test('returns undefined when the setting is unset', () => {
    assert.strictEqual(getSettingsConfig(), undefined);
  });

  test('returns undefined for an empty object', () => {
    vscode.setConfig('jsonschema', 'config', {});
    assert.strictEqual(getSettingsConfig(), undefined);
  });

  test('returns undefined for a non-object value', () => {
    vscode.setConfig('jsonschema', 'config', 'not-an-object');
    assert.strictEqual(getSettingsConfig(), undefined);
  });

  test('returns undefined for an array value', () => {
    vscode.setConfig('jsonschema', 'config', ['flat']);
    assert.strictEqual(getSettingsConfig(), undefined);
  });

  test('returns the object when non-empty', () => {
    vscode.setConfig('jsonschema', 'config', mdTemplateConfig);
    assert.deepStrictEqual(getSettingsConfig(), mdTemplateConfig);
  });
});

suite('[F01-FR-28][F09-FR-13] resolveConfigSource()', () => {
  setup(() => vscode.resetAll());

  test('returns undefined when neither a file nor a setting is present', () => {
    assert.strictEqual(resolveConfigSource(), undefined);
  });

  test('falls back to the jsonschema.config setting when no file is found', () => {
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/nonexistent-workspace-xyz' } }];
    vscode.setConfig('jsonschema', 'config', mdTemplateConfig);
    assert.deepStrictEqual(resolveConfigSource(), { inline: mdTemplateConfig });
  });

  test('the config file always wins over the jsonschema.config setting', () => {
    const fs  = require('fs');
    const os  = require('os');
    const pth = require('path');
    const tmp = fs.mkdtempSync(pth.join(os.tmpdir(), 'jspreview-'));
    const cfg = pth.join(tmp, CONFIG_FILENAME);
    fs.writeFileSync(cfg, '{}');
    try {
      vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmp } }];
      vscode.setConfig('jsonschema', 'config', mdTemplateConfig);
      assert.deepStrictEqual(resolveConfigSource(), { filePath: cfg });
    } finally {
      fs.unlinkSync(cfg);
      fs.rmdirSync(tmp);
    }
  });
});

suite('[F28] syncPreviewScroll()', () => {
  const schemaDoc = {
    languageId: 'json',
    getText: () => '{"$schema":"http://json-schema.org/draft-07/schema#"}',
    uri: { fsPath: '/ws/schema.json' },
    lineCount: 101,
  };
  let panel: { webview: { postMessage: sinon.SinonStub } };

  setup(() => {
    vscode.resetAll();
    Object.keys(openJsonSchemaFiles).forEach(k => delete openJsonSchemaFiles[k]);
    panel = { webview: { postMessage: sinon.stub() } };
  });

  test('[F28-FR-02][F28-FR-07] posts the proportional scroll fraction to the open panel via postMessage only', () => {
    openJsonSchemaFiles[schemaDoc.uri.fsPath] = panel;
    syncPreviewScroll(schemaDoc, 50);
    assert.strictEqual(panel.webview.postMessage.callCount, 1);
    assert.ok(panel.webview.postMessage.calledWithMatch({ type: 'scrollSync', fraction: 0.5 }));
  });

  test('[F28-FR-02] clamps the fraction to [0, 1]', () => {
    openJsonSchemaFiles[schemaDoc.uri.fsPath] = panel;
    syncPreviewScroll(schemaDoc, 100);
    assert.ok(panel.webview.postMessage.calledWithMatch({ type: 'scrollSync', fraction: 1 }));
  });

  test('[F28-FR-03] treats a document with fewer than 2 lines as fraction 0', () => {
    openJsonSchemaFiles[schemaDoc.uri.fsPath] = panel;
    syncPreviewScroll({ ...schemaDoc, lineCount: 1 }, 0);
    assert.ok(panel.webview.postMessage.calledWithMatch({ type: 'scrollSync', fraction: 0 }));
  });

  test('[F28-FR-04] does nothing when no preview panel is open for the document', () => {
    syncPreviewScroll(schemaDoc, 50);
    assert.ok(panel.webview.postMessage.notCalled);
  });

  test('[F28-FR-04] does nothing for a non-schema document', () => {
    const dataDoc = { ...schemaDoc, getText: () => '{"title":"plain data"}' };
    openJsonSchemaFiles[dataDoc.uri.fsPath] = panel;
    syncPreviewScroll(dataDoc, 50);
    assert.ok(panel.webview.postMessage.notCalled);
  });

  test('[F28-FR-05] does nothing when jsonschema.preview.syncScroll is false', () => {
    vscode.setConfig('jsonschema.preview', 'syncScroll', false);
    openJsonSchemaFiles[schemaDoc.uri.fsPath] = panel;
    syncPreviewScroll(schemaDoc, 50);
    assert.ok(panel.webview.postMessage.notCalled);
  });

  test('[F28-FR-01][F28-FR-05] syncs by default (setting unset)', () => {
    openJsonSchemaFiles[schemaDoc.uri.fsPath] = panel;
    syncPreviewScroll(schemaDoc, 50);
    assert.ok(panel.webview.postMessage.called);
  });
});
