// S08-SR-05 — the cross-folder half of the inline-binding requirement: "a
// schema path containing characters that require escaping in the target
// syntax." TOML has no settings-based binding (F11-FR-12), so the scope is
// always inline; when the schema lives in a *different* workspace folder than
// the data file, the embedded path must be absolute (F04-FR-13/F10-FR-05
// applied to inline scope), which on Windows contains backslashes — exactly
// the TOML basic-string escaping this suite exercises for real, on both
// platforms in the CI matrix (S08-SR-09).
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { withQuickPick, withCapturedMessages, writeFile, closeAllEditors, openDocument, FIXTURES_ROOT } from '../helpers';

const ROOT = path.join(FIXTURES_ROOT, 'multi-root');
const PROJ_A = path.join(ROOT, 'projA');
const PROJ_B = path.join(ROOT, 'projB');
const FILE = 'inline-cross-folder.toml';
const ORIGINAL = 'name = "example"\n';

function filePath(): string {
  return path.join(PROJ_A, FILE);
}

async function bindInline(): Promise<void> {
  await withQuickPick(
    (items, call) => {
      if (call === 0) { return items.find((i: any) => i.uri?.fsPath?.endsWith('schema.json')); }
      return items[0]; // TOML's picker only ever offers the single inline item.
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
      return items[0];
    },
    () => withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.bindToCurrentFile') as Promise<void>,
    ),
  );
}

suite('[S08-SR-05] Inline TOML binding across workspace folders (path escaping)', () => {
  setup(async () => {
    writeFile(filePath(), ORIGINAL);
    await closeAllEditors();
  });
  teardown(async () => {
    writeFile(filePath(), ORIGINAL);
    await closeAllEditors();
  });

  test('[S08-SR-05][F11-FR-16] embeds an absolute, correctly-escaped path to a schema in a different folder', async () => {
    await openDocument(filePath());
    await bindInline();

    const boundDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath()));
    const boundText = boundDoc.getText();
    // Alternation form (not `[^"]*(?:\\.[^"]*)*`) — the nested-quantifier
    // version is exponential-backtracking-prone on pathological input
    // (unterminated strings with many backslashes); this linear-time
    // equivalent matches the same escaped-TOML-string content.
    const match = /"\$schema"\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(boundText);
    assert.ok(match, `expected an inline "$schema" key, got:\n${boundText}`);

    // Reverse the same escaping the extension applies (backslash, then quote)
    // to recover the literal path and confirm it points at projB/schema.json —
    // an absolute path is required here since projA and projB are different
    // workspace folders (F04-FR-13/F10-FR-05).
    const embedded = JSON.parse(`"${match![1]}"`) as string;
    assert.ok(path.isAbsolute(embedded), `expected an absolute path across folders, got ${embedded}`);
    assert.strictEqual(embedded, path.join(PROJ_B, 'schema.json'));

    // The file itself must still be valid TOML after the edit — parseable by
    // the extension's own validator, which is the real proof the escaping
    // didn't corrupt the document (a raw, unescaped Windows path would not be).
    const { warnings, errors } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.validateFile') as Promise<void>,
    );
    assert.ok(!warnings.some(w => w.includes('No schema bound')), `warnings: ${JSON.stringify(warnings)}`);
    assert.ok(!errors.some(e => /parse/i.test(e)), `expected no TOML parse error, got errors: ${JSON.stringify(errors)}`);

    await removeInline();
    const cleanedText = (await vscode.workspace.openTextDocument(vscode.Uri.file(filePath()))).getText();
    assert.ok(!cleanedText.includes('"$schema"'), `expected "$schema" to be removed, got:\n${cleanedText}`);
  });
});
