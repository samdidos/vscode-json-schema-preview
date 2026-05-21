import * as assert from 'assert';
import * as vscode from 'vscode';
import { isJsonSchemaFile, CONFIG_FILENAME } from '../../PreviewWebPanel';

suite('isJsonSchemaFile', () => {
  test('returns false for undefined', () => {
    assert.strictEqual(isJsonSchemaFile(undefined), false);
  });

  test('returns true for JSON with $schema', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', title: 'Test' }),
      language: 'json',
    });
    assert.strictEqual(isJsonSchemaFile(doc), true);
  });

  test('returns false for JSON without $schema', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify({ title: 'No schema here', type: 'object' }),
      language: 'json',
    });
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns false for invalid JSON', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: '{ not valid json',
      language: 'json',
    });
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns true for YAML with $schema line', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: '$schema: http://json-schema.org/draft-07/schema#\ntitle: Test',
      language: 'yaml',
    });
    assert.strictEqual(isJsonSchemaFile(doc), true);
  });

  test('returns false for YAML without $schema', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'title: No schema\ntype: object',
      language: 'yaml',
    });
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('returns false for non-JSON/YAML file', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'plain text',
      language: 'plaintext',
    });
    assert.strictEqual(isJsonSchemaFile(doc), false);
  });

  test('CONFIG_FILENAME constant', () => {
    assert.strictEqual(CONFIG_FILENAME, '.json-schema-preview-config.json');
  });
});
