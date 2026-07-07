// S08-SR-05 — inline `$schema` binding round-trips (JSON, YAML, TOML) against
// a real VS Code instance: bind, assert the document text, validate, remove,
// assert clean.
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { withQuickPick, withCapturedMessages, writeFile, closeAllEditors, openDocument, FIXTURES_ROOT } from '../helpers';

const FIXTURE = path.join(FIXTURES_ROOT, 'single-folder');
const SCHEMA_PATH = path.join(FIXTURE, 'schema.json');

interface FormatCase {
  file: string;
  originalContent: string;
  schemaKeyFragment: string; // substring expected once inline-bound
}

const CASES: FormatCase[] = [
  { file: 'inline.json', originalContent: '{\n  "name": "example"\n}\n', schemaKeyFragment: '"$schema"' },
  // The support fixture extension registers yaml.schemas but is NOT
  // redhat.vscode-yaml, so F10-FR-09's "extension installed?" check is false
  // and the plain `$schema:` YAML key is written (not the directive comment).
  { file: 'inline.yaml', originalContent: 'name: example\n', schemaKeyFragment: '$schema:' },
  { file: 'inline.toml', originalContent: 'name = "example"\n', schemaKeyFragment: '"$schema"' },
];

function fixturePath(file: string): string {
  return path.join(FIXTURE, file);
}

async function bindInline(): Promise<void> {
  await withQuickPick(
    (items, call) => {
      if (call === 0) { return items.find((i: any) => i.uri?.fsPath?.endsWith('schema.json')); }
      // TOML's picker only ever offers the inline item; JSON/YAML's picker
      // offers Inline/Local project/User — match by label either way.
      return items.find((i: any) => /inline/i.test(i.label ?? '')) ?? items[0];
    },
    () => withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.bindToCurrentFile') as Promise<void>,
    ),
  );
}

async function removeInline(): Promise<void> {
  await withQuickPick(
    (items, call) => {
      if (call === 0) { return items.find((i: any) => i.isRemove); }
      return items.find((i: any) => /inline/i.test(i.label ?? '')) ?? items[0];
    },
    () => withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.bindToCurrentFile') as Promise<void>,
    ),
  );
}

async function openFixtureFile(file: string): Promise<vscode.TextDocument> {
  return openDocument(fixturePath(file));
}

suite('[S08-SR-05] Inline binding round-trip — JSON/YAML/TOML', () => {
  setup(async () => {
    for (const c of CASES) { writeFile(fixturePath(c.file), c.originalContent); }
    await closeAllEditors();
  });
  teardown(async () => {
    for (const c of CASES) { writeFile(fixturePath(c.file), c.originalContent); }
    await closeAllEditors();
  });

  for (const c of CASES) {
    test(`[S08-SR-05] ${c.file}: bind inline, validate, remove, clean`, async () => {
      await openFixtureFile(c.file);
      await bindInline();

      // Re-open to read the saved-to-disk content (bindToCurrentFile applies a
      // WorkspaceEdit; the document/editor may need saving depending on
      // files.autoSave, so read via the TextDocument's own text, not the file).
      const boundDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(fixturePath(c.file)));
      const boundText = boundDoc.getText();
      assert.ok(
        boundText.includes(c.schemaKeyFragment),
        `expected ${c.file} to contain an inline ${c.schemaKeyFragment} after binding, got:\n${boundText}`
      );
      assert.ok(
        boundText.includes(path.basename(SCHEMA_PATH)),
        `expected ${c.file}'s inline binding to reference schema.json, got:\n${boundText}`
      );

      const { info, warnings, errors } = await withCapturedMessages(
        () => vscode.commands.executeCommand('jsonschema.validateFile') as Promise<void>,
      );
      assert.ok(
        !warnings.some(w => w.includes('No schema bound')),
        `expected the validator to recognise the inline binding for ${c.file} (warnings: ${JSON.stringify(warnings)})`
      );
      assert.ok(
        info.some(m => m.includes('is valid against')),
        `expected a successful validation message for ${c.file} (got info: ${JSON.stringify(info)}, warnings: ${JSON.stringify(warnings)}, errors: ${JSON.stringify(errors)})`
      );

      await removeInline();
      const cleanedDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(fixturePath(c.file)));
      const cleanedText = cleanedDoc.getText();
      assert.ok(
        !cleanedText.includes(c.schemaKeyFragment),
        `expected the inline ${c.schemaKeyFragment} to be removed from ${c.file}, got:\n${cleanedText}`
      );
    });
  }
});

// S08-SR-05 explicitly calls for a TOML file whose first content is a
// [table] header — this exercises both the insertion point (F11-FR-16: the
// $schema key must land before the table, since TOML requires top-level keys
// to precede table sections) and detection/removal being restricted to the
// root table (F11-FR-15/17), against the real jsonc/TOML write path rather
// than the mocked one the unit suite uses.
suite('[S08-SR-05] Inline TOML binding above an existing [table] header', () => {
  const file = 'inline-with-table.toml';
  const original = '[server]\nhost = "localhost"\n';

  setup(async () => {
    writeFile(fixturePath(file), original);
    await closeAllEditors();
  });
  teardown(async () => {
    writeFile(fixturePath(file), original);
    await closeAllEditors();
  });

  test('[S08-SR-05] inserts $schema before the [server] table and removes cleanly', async () => {
    await openFixtureFile(file);
    await bindInline();

    const boundDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(fixturePath(file)));
    const boundText = boundDoc.getText();
    const schemaLine = boundText.indexOf('"$schema"');
    const tableLine = boundText.indexOf('[server]');
    assert.ok(schemaLine >= 0, `expected an inline "$schema" key, got:\n${boundText}`);
    assert.ok(tableLine >= 0, `expected the [server] table to survive binding, got:\n${boundText}`);
    assert.ok(
      schemaLine < tableLine,
      `expected "$schema" to be inserted before [server] (TOML requires top-level keys to precede tables), got:\n${boundText}`
    );

    const { warnings } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.validateFile') as Promise<void>,
    );
    assert.ok(
      !warnings.some(w => w.includes('No schema bound')),
      `expected the validator to recognise the inline binding (warnings: ${JSON.stringify(warnings)})`
    );

    await removeInline();
    const cleanedDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(fixturePath(file)));
    const cleanedText = cleanedDoc.getText();
    assert.ok(!cleanedText.includes('"$schema"'), `expected "$schema" to be removed, got:\n${cleanedText}`);
    assert.ok(cleanedText.includes('[server]'), `expected the [server] table to survive removal, got:\n${cleanedText}`);
  });
});
