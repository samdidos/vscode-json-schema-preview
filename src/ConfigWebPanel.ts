import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CONFIG_FILENAME, findConfigFile } from './PreviewWebPanel';

const CONFIG_SCHEMA_URL =
  'https://raw.githubusercontent.com/coveooss/json-schema-for-humans/main/config_schema.json';

/**
 * Registers a json.schemas workspace binding so VS Code's built-in JSON
 * language server provides autocomplete and validation when the config file
 * is opened directly. Idempotent — skips the settings write if the binding
 * already exists.
 */
async function ensureConfigSchemaBinding(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  const cfg = vscode.workspace.getConfiguration('json', folder.uri);
  const schemas = cfg.get<any[]>('schemas') ?? [];
  if (schemas.some(s => (s.fileMatch ?? []).includes(CONFIG_FILENAME))) return;

  schemas.push({ url: CONFIG_SCHEMA_URL, fileMatch: [CONFIG_FILENAME] });
  await cfg.update('schemas', schemas, vscode.ConfigurationTarget.Workspace);
}

/** Adds a `$schema` field to the config file if it doesn't already have one. */
function injectSchemaField(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const obj = JSON.parse(content) as Record<string, unknown>;
    if (obj.$schema) return;
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
  if (existing) return existing;

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
