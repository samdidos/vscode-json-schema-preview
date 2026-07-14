// Real-VS-Code end-to-end coverage for the two features that the mocked unit
// suite can only exercise through stubs:
//   * F21 — validation quick fixes: drive the actual VS Code code-action flow
//     (`vscode.executeCodeActionProvider`) against real validation diagnostics
//     and apply the returned WorkspaceEdit, proving the lightbulb repairs the
//     document for real (not just that buildFixes computes the right intent).
//   * F22 — draft migration: run the command against a schema with legacy
//     keywords and assert the migrated document VS Code opens actually contains
//     the upgraded shape.
// Both stay offline (S08-NFR-02): the schema is a local file referenced by an
// inline relative `$schema`, so no network or cache is involved.
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { withQuickPick, withCapturedMessages, closeAllEditors, openDocument, FIXTURES_ROOT } from '../helpers';

const FIXTURE = path.join(FIXTURES_ROOT, 'single-folder');
const QF_SCHEMA = path.join(FIXTURE, 'quickfix.schema.json');
const QF_DATA = path.join(FIXTURE, 'quickfix-data.json');
const MIGRATE_SCHEMA = path.join(FIXTURE, 'migrate.schema.json');

// A closed object schema requiring `name`, so invalid data yields two fixable
// errors: a missing required property and an unexpected additional property.
const QF_SCHEMA_TEXT = JSON.stringify({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string' } },
  additionalProperties: false,
}, null, 2) + '\n';

// Inline relative `$schema` → resolved as a local schema *file* (not a
// meta-schema), so this document is data, and validation binds to QF_SCHEMA.
const QF_DATA_TEXT = JSON.stringify({ $schema: './quickfix.schema.json', extra: 1 }, null, 2) + '\n';

// A draft-07 schema whose `definitions` + local `$ref` must become `$defs` +
// `#/$defs/...` when migrated to 2020-12.
const MIGRATE_SCHEMA_TEXT = JSON.stringify({
  $schema: 'http://json-schema.org/draft-07/schema#',
  definitions: { Id: { type: 'string' } },
  properties: { id: { $ref: '#/definitions/Id' } },
}, null, 2) + '\n';

function cleanup(): void {
  for (const f of [QF_SCHEMA, QF_DATA, MIGRATE_SCHEMA]) {
    try { fs.unlinkSync(f); } catch { /* not created */ }
  }
}

suite('[F21-FR-07] Validation quick fixes — real code-action round-trip', () => {
  setup(async () => {
    fs.writeFileSync(QF_SCHEMA, QF_SCHEMA_TEXT);
    fs.writeFileSync(QF_DATA, QF_DATA_TEXT);
    await closeAllEditors();
  });
  teardown(async () => { cleanup(); await closeAllEditors(); });

  test('[F21-FR-02] the lightbulb offers repairs that make the document valid', async () => {
    const doc = await openDocument(QF_DATA);

    // Validate: records fixes and sets "JSON Schema" diagnostics on the document.
    const { errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.validateFile') as Promise<void>,
    );
    // Validation *reports* errors via showErrorMessage — that is expected here,
    // it is not a test failure; assert instead that diagnostics were produced.
    const diagnostics = vscode.languages.getDiagnostics(doc.uri)
      .filter(d => d.source === 'JSON Schema');
    assert.ok(diagnostics.length >= 1, `expected validation diagnostics, got ${diagnostics.length} (errors: ${JSON.stringify(errors)})`);

    // Ask VS Code for the code actions over the whole document.
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider', doc.uri, fullRange,
    );
    const titles = (actions ?? []).map(a => a.title);
    assert.ok(titles.some(t => /Add missing required property "name"/.test(t)),
      `expected an add-required fix, got ${JSON.stringify(titles)}`);
    assert.ok(titles.some(t => /Remove unexpected property "extra"/.test(t)),
      `expected a remove-additional fix, got ${JSON.stringify(titles)}`);

    // Apply the add-required fix and confirm the edit really lands in the doc.
    const addName = (actions ?? []).find(a => /Add missing required property "name"/.test(a.title));
    assert.ok(addName?.edit, 'the add-required action must carry a WorkspaceEdit');
    const applied = await vscode.workspace.applyEdit(addName!.edit!);
    assert.ok(applied, 'applyEdit should succeed');
    assert.ok(/"name"\s*:/.test(doc.getText()), 'the document should now contain a "name" property');
  });
});

suite('[F22-FR-10] Draft migration — real command round-trip', () => {
  setup(async () => {
    fs.writeFileSync(MIGRATE_SCHEMA, MIGRATE_SCHEMA_TEXT);
    await closeAllEditors();
  });
  teardown(async () => { cleanup(); await closeAllEditors(); });

  test('[F22-FR-11] migrating to 2020-12 opens a document with $defs and a rewritten $ref', async () => {
    await openDocument(MIGRATE_SCHEMA);

    const { errors } = await withQuickPick(
      items => items.find((i: any) => i.id === '2020-12'),
      () => withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.migrateDraft') as Promise<void>,
      ),
    );
    assert.deepStrictEqual(errors, [], `migrate reported errors: ${JSON.stringify(errors)}`);

    // The migrated result is opened in a NEW untitled document beside the
    // source. Locate it via workspace.textDocuments rather than
    // activeTextEditor: after showTextDocument resolves, the active-editor
    // update can lag on some platforms (observed on Windows CI), so relying on
    // focus is racy — the open untitled document is deterministic.
    const migratedDoc = vscode.workspace.textDocuments.find(
      d => d.isUntitled && d.getText().includes('#/$defs/Id'),
    );
    assert.ok(migratedDoc, 'a migrated untitled document containing the rewritten $ref should be open');
    const migrated = JSON.parse(migratedDoc!.getText());
    assert.strictEqual(migrated.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(migrated.$defs && !migrated.definitions, 'definitions should have become $defs');
    assert.strictEqual(migrated.properties.id.$ref, '#/$defs/Id', 'the local $ref should be rewritten');

    // The source file on disk is untouched (migration never edits in place).
    const onDisk = JSON.parse(fs.readFileSync(MIGRATE_SCHEMA, 'utf-8'));
    assert.ok(onDisk.definitions && !onDisk.$defs, 'the source schema file must be unchanged');
  });
});
