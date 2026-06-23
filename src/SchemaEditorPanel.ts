// Coverage excluded: this file creates a VS Code WebviewPanel and communicates
// with it via postMessage. Webview lifecycle and message-passing cannot be
// exercised in unit tests without a full VS Code UI harness.
// Covered by manual and end-to-end testing instead.
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as YAML from 'yaml';
import { JE_PANEL_CSS, getNonce, sanitizeHtml, embedJson } from './webviewUtils';

// One panel per open schema file
const panels = new Map<string, vscode.WebviewPanel>();

export function openSchemaEditor(context: vscode.ExtensionContext, uri: vscode.Uri) {
  const filePath = uri.fsPath;

  const existing = panels.get(filePath);
  if (existing) {
    existing.reveal();
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const isYaml = ext === '.yaml' || ext === '.yml';

  let currentSchema: object = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    currentSchema = isYaml ? (YAML.parse(raw) as object ?? {}) : JSON.parse(raw);
  } catch (err) {
    vscode.window.showErrorMessage(`Could not read schema file: ${(err as Error).message}`);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'jsonschema-editor',
    `Edit: ${path.basename(filePath)}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      retainContextWhenHidden: true,
    }
  );

  const jsonEditorUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'jsoneditor.js')
  );

  panel.webview.html = buildEditorPage(
    jsonEditorUri,
    currentSchema,
    path.basename(filePath),
    panel.webview.cspSource,
    getNonce(),
  );

  const messageSub = panel.webview.onDidReceiveMessage(async message => {
    if (message.type === 'save') {
      try {
        const content = isYaml
          ? YAML.stringify(message.schema as object)
          : JSON.stringify(message.schema, null, 2) + '\n';
        fs.writeFileSync(filePath, content, 'utf-8');
        vscode.window.showInformationMessage(`Saved ${path.basename(filePath)}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Save failed: ${(err as Error).message}`);
      }
    } else if (message.type === 'openFile') {
      const doc = await vscode.workspace.openTextDocument(uri);
      vscode.window.showTextDocument(doc, { preview: false });
    }
  });

  panel.onDidDispose(() => {
    messageSub.dispose();
    panels.delete(filePath);
  });
  context.subscriptions.push(panel);
  panels.set(filePath, panel);
}

// ---------------------------------------------------------------------------
// Curated JSON Schema meta-schema used to drive the editor form.
// Covers the most common keywords without recursive self-reference,
// so json-editor can render a clean, finite form.
// ---------------------------------------------------------------------------
const SCHEMA_META: object = {
  title: 'JSON Schema',
  type: 'object',
  properties: {
    $schema: { type: 'string', title: '$schema', description: 'Schema version URI' },
    $id:     { type: 'string', title: '$id',     description: 'Unique identifier for this schema' },
    title:   { type: 'string', title: 'Title',   description: 'Human-readable label' },
    description: {
      type: 'string', title: 'Description', description: 'Detailed explanation of this schema',
      format: 'textarea',
    },
    type: {
      title: 'Type', description: 'Allowed data type(s)',
      type: 'string',
      enum: ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'],
    },
    // --- string constraints ---
    minLength: { type: 'integer', title: 'minLength', minimum: 0 },
    maxLength: { type: 'integer', title: 'maxLength', minimum: 0 },
    pattern:   { type: 'string',  title: 'pattern',   description: 'Regular expression the value must match' },
    format:    { type: 'string',  title: 'format',    description: 'Semantic format (e.g. email, date, uri)' },
    // --- number constraints ---
    minimum:          { type: 'number',  title: 'minimum' },
    maximum:          { type: 'number',  title: 'maximum' },
    exclusiveMinimum: { type: 'number',  title: 'exclusiveMinimum' },
    exclusiveMaximum: { type: 'number',  title: 'exclusiveMaximum' },
    multipleOf:       { type: 'number',  title: 'multipleOf', exclusiveMinimum: 0 },
    // --- object constraints ---
    required: {
      title: 'required', description: 'Names of required properties',
      type: 'array', items: { type: 'string', title: 'property name' },
    },
    additionalProperties: {
      title: 'additionalProperties',
      description: 'Whether extra properties are allowed (false = no)',
      type: 'boolean',
    },
    minProperties: { type: 'integer', title: 'minProperties', minimum: 0 },
    maxProperties: { type: 'integer', title: 'maxProperties', minimum: 0 },
    // --- array constraints ---
    minItems:    { type: 'integer', title: 'minItems',    minimum: 0 },
    maxItems:    { type: 'integer', title: 'maxItems',    minimum: 0 },
    uniqueItems: { type: 'boolean', title: 'uniqueItems' },
    // --- value constraints ---
    enum: {
      title: 'enum', description: 'Exhaustive list of allowed values',
      type: 'array', items: { type: 'string', title: 'value' },
    },
    default: { type: 'string', title: 'default', description: 'Default value (as JSON literal)' },
    // --- object properties ---
    properties: {
      title: 'properties', description: 'Definition of each object property',
      type: 'object',
      additionalProperties: {
        type: 'object',
        title: 'property',
        properties: {
          title:       { type: 'string', title: 'title' },
          description: { type: 'string', title: 'description', format: 'textarea' },
          type: {
            type: 'string', title: 'type',
            enum: ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'],
          },
          format:    { type: 'string',  title: 'format' },
          default:   { type: 'string',  title: 'default' },
          minLength: { type: 'integer', title: 'minLength', minimum: 0 },
          maxLength: { type: 'integer', title: 'maxLength', minimum: 0 },
          minimum:   { type: 'number',  title: 'minimum' },
          maximum:   { type: 'number',  title: 'maximum' },
          pattern:   { type: 'string',  title: 'pattern' },
          enum: {
            title: 'enum', type: 'array',
            items: { type: 'string', title: 'value' },
          },
        },
      },
    },
    // --- array items ---
    items: {
      title: 'items', description: 'Schema for array items',
      type: 'object',
      properties: {
        type: {
          type: 'string', title: 'type',
          enum: ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'],
        },
        title:       { type: 'string', title: 'title' },
        description: { type: 'string', title: 'description' },
        format:      { type: 'string', title: 'format' },
        minimum:     { type: 'number', title: 'minimum' },
        maximum:     { type: 'number', title: 'maximum' },
        minLength:   { type: 'integer', title: 'minLength', minimum: 0 },
        maxLength:   { type: 'integer', title: 'maxLength', minimum: 0 },
        enum: { type: 'array', title: 'enum', items: { type: 'string', title: 'value' } },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Webview HTML
// ---------------------------------------------------------------------------

function buildEditorPage(
  jsonEditorUri: vscode.Uri,
  currentSchema: object,
  filename: string,
  cspSource: string,
  nonce: string
): string {
  const safeFilename = sanitizeHtml(filename);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit: ${safeFilename}</title>
  <style>
    ${JE_PANEL_CSS}
    .header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Edit Schema: <span style="font-weight:400;color:var(--text2)">${safeFilename}</span></h1>
    <button class="btn-file" onclick="openFile()" title="Open raw JSON file in editor">Open file ↗</button>
  </div>
  <p class="subtitle">Common JSON Schema keywords. Save to write back to the file — the preview reloads automatically.</p>
  <div id="editor-container"></div>
  <div class="save-bar">
    <button class="btn-save" onclick="saveSchema()">Save</button>
    <span class="save-hint">Writes to <code>${safeFilename}</code> · preview reloads on save</span>
  </div>

  <script nonce="${nonce}" src="${jsonEditorUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const schema   = ${embedJson(SCHEMA_META)};
    const initval  = ${embedJson(currentSchema)};

    const editor = new JSONEditor(document.getElementById('editor-container'), {
      schema,
      startval: initval,
      theme: 'barebones',
      iconlib: false,
      disable_edit_json: true,
      disable_properties: false,
      disable_collapse: false,
      no_additional_properties: false,
    });

    editor.on('ready', () => {
      document.getElementById('editor-container').classList.add('je-ready');
    });

    function saveSchema() {
      vscode.postMessage({ type: 'save', schema: editor.getValue() });
    }

    function openFile() {
      vscode.postMessage({ type: 'openFile' });
    }
  </script>
</body>
</html>`;
}
