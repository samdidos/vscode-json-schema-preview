// F22 — the migrate-draft command. Parses the active schema, prompts for a
// target draft, runs the pure transform, and opens the result in a new editor
// beside the source (never touching the original — F22-FR-11). All transform
// logic lives in `draftMigration`; this is thin VS Code glue.
import * as vscode from 'vscode';
import * as YAML from 'yaml';
import { migrateSchema, type TargetDraft } from './draftMigration';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { isYaml } from './languages';

interface DraftPick extends vscode.QuickPickItem { id: TargetDraft; }

const DRAFT_PICKS: DraftPick[] = [
  { label: 'Draft 2020-12', description: 'latest; prefixItems, $dynamicRef', id: '2020-12' },
  { label: 'Draft 2019-09', description: '$defs, dependentRequired/Schemas', id: '2019-09' },
  { label: 'Draft-07', description: 'widely supported; definitions, dependencies', id: 'draft-07' },
];

export function migrateDraftCommand() {
  return async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isJsonSchemaFile(editor.document)) {
      vscode.window.showInformationMessage('Open a JSON Schema file to migrate it to another draft.');
      return;
    }
    const doc = editor.document;
    const schema = parseSchemaText(doc.getText(), doc.languageId);
    if (schema === undefined) {
      vscode.window.showErrorMessage('Cannot parse the current schema file.');
      return;
    }

    const pick = await vscode.window.showQuickPick(DRAFT_PICKS, {
      title: 'Migrate schema to which draft?',
      placeHolder: 'Choose the target JSON Schema draft',
    });
    if (!pick) { return; }

    const { schema: migrated, changes } = migrateSchema(schema, pick.id);
    if (changes.length === 0) {
      vscode.window.showInformationMessage(`Schema already conforms to ${pick.label} — nothing to migrate.`);
      return;
    }

    const asYaml = isYaml(doc.languageId);
    const content = asYaml ? YAML.stringify(migrated) : JSON.stringify(migrated, null, 2);
    const newDoc = await vscode.workspace.openTextDocument({
      content,
      language: asYaml ? 'yaml' : 'json',
    });
    await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);
    vscode.window.showInformationMessage(
      `Migrated to ${pick.label}: ${changes.length} change${changes.length === 1 ? '' : 's'}. Review and save to keep it.`,
    );
  };
}
