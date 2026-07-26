import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CONFIG_FILENAME, findConfigFile } from './PreviewWebPanel';
import { pickInspectValue } from './SchemaBindingManager';

const CONFIG_SCHEMA_URL =
  'https://raw.githubusercontent.com/coveooss/json-schema-for-humans/main/config_schema.json';

const SETTINGS_SECTION = 'jsonschema';
const SETTINGS_KEY = 'config';

// ---------------------------------------------------------------------------
// Settings-based configuration (F09-FR-01/12/13/14)
// ---------------------------------------------------------------------------

interface ScopeChoice {
  target: vscode.ConfigurationTarget;
  /** Resource used to resolve/write the WorkspaceFolder-scoped value. */
  scopeUri?: vscode.Uri;
}

/**
 * Mirrors the scope picker already used by Bind Schema… (SchemaBindingManager
 * .pickScope) — same three tiers, same "only show what applies" behaviour —
 * so choosing where `jsonschema.config` lives feels like the rest of the
 * extension (F09-FR-14).
 */
async function pickConfigScope(): Promise<ScopeChoice | undefined> {
  type ScopeItem = vscode.QuickPickItem & ScopeChoice;

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const folder = (activeUri && vscode.workspace.getWorkspaceFolder(activeUri))
    ?? vscode.workspace.workspaceFolders?.[0];

  const items: ScopeItem[] = [];

  if (folder) {
    items.push({
      label: '$(file-directory) Workspace Folder',
      description: '.vscode/settings.json',
      detail: `Saved in ${folder.name}'s .vscode/settings.json — scoped to this project`,
      target: vscode.ConfigurationTarget.WorkspaceFolder,
      scopeUri: folder.uri,
    });

    const wsFile = vscode.workspace.workspaceFile;
    if (wsFile) {
      items.push({
        label: '$(root-folder) Workspace',
        description: path.basename(wsFile.fsPath),
        detail: `Saved in ${path.basename(wsFile.fsPath)} — applies to all folders in this workspace`,
        target: vscode.ConfigurationTarget.Workspace,
        scopeUri: folder.uri,
      });
    }
  }

  items.push({
    label: '$(person) User',
    description: '~/.vscode/settings.json',
    detail: 'Saved in your global user settings — applies to all workspaces on this machine',
    target: vscode.ConfigurationTarget.Global,
  });

  if (items.length === 1) {return items[0];}

  return vscode.window.showQuickPick(items, {
    placeHolder: 'Where should jsonschema.config be edited?',
  });
}

/**
 * Ensures `jsonschema.config` has an own value at the chosen scope (seeding
 * `{}` if that scope has no value of its own yet — an inherited value from a
 * broader scope doesn't count, or seeding would silently create an unwanted
 * override), then opens that scope's settings file with the key revealed
 * (F09-FR-01).
 */
export async function configurePreview(): Promise<void> {
  const choice = await pickConfigScope();
  if (!choice) {return;}

  const cfg = vscode.workspace.getConfiguration(SETTINGS_SECTION, choice.scopeUri);
  const inspected = cfg.inspect<Record<string, unknown>>(SETTINGS_KEY);
  const ownValue = pickInspectValue(inspected, choice.target);
  if (ownValue === undefined) {
    await cfg.update(SETTINGS_KEY, {}, choice.target);
  }

  await vscode.commands.executeCommand(
    choice.target === vscode.ConfigurationTarget.Global
      ? 'workbench.action.openSettingsJson'
      : 'workbench.action.openWorkspaceSettingsFile',
    { revealSetting: { key: `${SETTINGS_SECTION}.${SETTINGS_KEY}` } }
  );
}

/**
 * Registers a json.schemas workspace binding so VS Code's built-in JSON
 * language server provides autocomplete and validation when the config file
 * is opened directly. Idempotent — skips the settings write if the binding
 * already exists.
 */
async function ensureConfigSchemaBinding(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {return;}

  const cfg = vscode.workspace.getConfiguration('json', folder.uri);
  const schemas = cfg.get<any[]>('schemas') ?? [];
  if (schemas.some(s => (s.fileMatch ?? []).includes(CONFIG_FILENAME))) {return;}

  schemas.push({ url: CONFIG_SCHEMA_URL, fileMatch: [CONFIG_FILENAME] });
  await cfg.update('schemas', schemas, vscode.ConfigurationTarget.Workspace);
}

/** Adds a `$schema` field to the config file if it doesn't already have one. */
function injectSchemaField(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const obj = JSON.parse(content) as Record<string, unknown>;
    if (obj.$schema) {return;}
    fs.writeFileSync(
      filePath,
      JSON.stringify({ $schema: CONFIG_SCHEMA_URL, ...obj }, null, 2) + '\n',
      'utf-8'
    );
  } catch {
    // unparseable — leave as is
  }
}

function getConfigFilePath(): string {
  const existing = findConfigFile();
  if (existing) {return existing;}

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    return path.join(workspaceRoot, CONFIG_FILENAME);
  }
  throw new Error('No workspace folder is open. Please open a folder first.');
}

export async function openConfigFile(): Promise<void> {
  let filePath: string;
  try {
    filePath = getConfigFilePath();
  } catch (err) {
    vscode.window.showErrorMessage(String(err));
    return;
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ $schema: CONFIG_SCHEMA_URL }, null, 2) + '\n',
      'utf-8'
    );
  } else {
    injectSchemaField(filePath);
  }
  ensureConfigSchemaBinding().catch(() => { /* non-fatal */ });
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc, { preview: false });
}
