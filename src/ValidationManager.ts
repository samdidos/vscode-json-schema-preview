// Coverage excluded: registers a DiagnosticCollection and wires VS Code UI
// (notifications, error messages). Covered by manual / E2E testing.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findBoundSchemaPath, extractInlineSchemaUrl, normalise } from './SchemaBindingManager';
import * as YAML from 'yaml';
import { isYaml, stripJsoncComments, parseJsonl } from './languages';
import { SchemaAuthManager, AuthRequiredError } from './SchemaAuthManager';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Ajv = require('ajv').default as typeof import('ajv').default;

export const validationDiagnostics =
  vscode.languages.createDiagnosticCollection('json-schema-validation');

export function validateCurrentFile(auth: SchemaAuthManager) {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Open a JSON or YAML file to validate.');
      return;
    }

    const doc = editor.document;
    if (!['json', 'jsonc', 'jsonl', 'yaml', 'yml'].includes(doc.languageId)) {
      vscode.window.showInformationMessage('Validation supports JSON, JSONC, JSONL, and YAML files.');
      return;
    }

    // External binding takes precedence; fall back to the file's own $schema field.
    const schemaPath = findBoundSchemaPath(doc) ?? extractInlineSchemaUrl(doc);
    if (!schemaPath) {
      const action = await vscode.window.showWarningMessage(
        `No schema bound to ${path.basename(doc.uri.fsPath)}. Bind one first.`,
        'Bind Schema'
      );
      if (action === 'Bind Schema') {
        vscode.commands.executeCommand('jsonschema.bindToCurrentFile');
      }
      return;
    }

    let schema: unknown;
    try {
      schema = await loadSchema(schemaPath, auth, doc);
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        const action = await vscode.window.showErrorMessage(
          `Schema at ${SchemaAuthManager.hostOf(e.url)} requires authentication (HTTP ${e.status}).`,
          'Configure Auth'
        );
        if (action === 'Configure Auth') {
          vscode.commands.executeCommand('jsonschema.configureSchemaAuth', e.url);
        }
        return;
      }
      vscode.window.showErrorMessage(
        `Cannot load schema "${path.basename(schemaPath)}": ${(e as Error).message}`
      );
      return;
    }

    let items: unknown[];
    try {
      const text = doc.getText();
      if (isYaml(doc.languageId)) {
        items = [YAML.parse(text)];
      } else if (doc.languageId === 'jsonl') {
        items = parseJsonl(text);
      } else if (doc.languageId === 'jsonc') {
        items = [JSON.parse(stripJsoncComments(text))];
      } else {
        items = [JSON.parse(text)];
      }
    } catch (e) {
      vscode.window.showErrorMessage(
        `Cannot parse ${path.basename(doc.uri.fsPath)}: ${(e as Error).message}`
      );
      return;
    }

    const ajv = new Ajv({ allErrors: true, strict: false });
    let validate: ReturnType<typeof ajv.compile>;
    try {
      validate = ajv.compile(schema as object);
    } catch (e) {
      vscode.window.showErrorMessage(`Cannot compile schema: ${(e as Error).message}`);
      return;
    }

    validationDiagnostics.delete(doc.uri);
    const diags: vscode.Diagnostic[] = [];

    for (const data of items) {
      if (!validate(data)) {
        for (const err of validate.errors ?? []) {
          const range = locateInDocument(doc, err.instancePath ?? '');
          const label = err.instancePath || '(root)';
          diags.push(new vscode.Diagnostic(
            range,
            `${label}: ${err.message ?? 'validation error'}`,
            vscode.DiagnosticSeverity.Error
          ));
        }
      }
    }

    if (diags.length === 0) {
      vscode.window.showInformationMessage(
        `✓ ${path.basename(doc.uri.fsPath)} is valid against ${path.basename(schemaPath)}.`
      );
      return;
    }

    validationDiagnostics.set(doc.uri, diags);
    vscode.window.showErrorMessage(
      `✗ ${diags.length} validation error${diags.length === 1 ? '' : 's'} in ` +
      `${path.basename(doc.uri.fsPath)}. See Problems panel.`
    );
  };
}

/** Load and parse a schema, fetching with auth headers when it is a remote URL. */
async function loadSchema(
  schemaPath: string,
  auth: SchemaAuthManager,
  doc: vscode.TextDocument,
): Promise<unknown> {
  if (SchemaAuthManager.isRemoteUrl(schemaPath)) {
    return JSON.parse(await auth.fetchText(schemaPath));
  }
  let resolved = schemaPath;
  if (!path.isAbsolute(resolved)) {
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (folder) { resolved = path.join(folder.uri.fsPath, normalise(resolved)); }
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
}

function locateInDocument(doc: vscode.TextDocument, instancePath: string): vscode.Range {
  const parts = instancePath.split('/').filter(Boolean);
  if (!parts.length) { return new vscode.Range(0, 0, 0, 0); }

  for (let i = parts.length - 1; i >= 0; i--) {
    const key = parts[i];
    if (/^\d+$/.test(key)) { continue; } // array index — skip
    const pattern = new RegExp(`"${escapeRegex(key)}"\\s*:`);
    const match = pattern.exec(doc.getText());
    if (match) {
      const pos = doc.positionAt(match.index);
      return new vscode.Range(pos, doc.positionAt(match.index + match[0].length));
    }
  }
  return new vscode.Range(0, 0, 0, 0);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
