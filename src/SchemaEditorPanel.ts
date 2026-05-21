import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
  if (ext === '.yaml' || ext === '.yml') {
    vscode.window.showWarningMessage(
      'The visual schema editor only supports JSON files. Open the file directly to edit YAML.',
      'Open file'
    ).then(choice => {
      if (choice === 'Open file') {
        vscode.window.showTextDocument(uri, { preview: false });
      }
    });
    return;
  }

  let currentSchema: object = {};
  try {
    currentSchema = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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

  panel.webview.html = buildEditorPage(jsonEditorUri, currentSchema, path.basename(filePath));

  panel.webview.onDidReceiveMessage(async message => {
    if (message.type === 'save') {
      try {
        fs.writeFileSync(filePath, JSON.stringify(message.schema, null, 2) + '\n', 'utf-8');
        vscode.window.showInformationMessage(`Saved ${path.basename(filePath)}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Save failed: ${(err as Error).message}`);
      }
    } else if (message.type === 'openFile') {
      const doc = await vscode.workspace.openTextDocument(uri);
      vscode.window.showTextDocument(doc, { preview: false });
    }
  });

  panel.onDidDispose(() => panels.delete(filePath));
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
  filename: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit: ${filename}</title>
  <style>
    :root {
      --bg: #1e1e1e; --bg2: #252526; --bg3: #2d2d30;
      --border: #3c3c3c; --text: #cccccc; --text2: #9d9d9d;
      --accent: #0078d4; --accent-hover: #106ebe; --radius: 4px;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, 'Segoe UI', sans-serif);
           font-size: 13px; line-height: 1.5; color: var(--text);
           background: var(--bg); margin: 0; padding: 24px 32px 48px; }
    .header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0; }
    .subtitle { color: var(--text2); margin: 0 0 24px; font-size: 12px; }
    .btn-file {
      background: none; color: var(--accent); border: 1px solid var(--accent);
      border-radius: var(--radius); padding: 3px 10px; font-size: 12px;
      cursor: pointer; transition: background .15s;
    }
    .btn-file:hover { background: rgba(0,120,212,.12); }

    /* json-editor overrides */
    .je-ready { color: var(--text); }
    .je-ready h3 { font-size: 13px; font-weight: 600; margin: 0 0 2px; color: var(--text); }
    .je-ready p.je-desc { color: var(--text2); font-size: 12px; margin: 0 0 6px; }
    .je-ready label { display: block; font-size: 12px; font-weight: 600;
                      color: var(--text2); margin-bottom: 4px; }
    .je-ready input[type=text], .je-ready input[type=number],
    .je-ready select, .je-ready textarea {
      width: 100%; background: var(--bg2); color: var(--text);
      border: 1px solid var(--border); border-radius: var(--radius);
      padding: 5px 8px; font-size: 13px; font-family: inherit;
      outline: none; transition: border-color .15s;
    }
    .je-ready input:focus, .je-ready select:focus, .je-ready textarea:focus {
      border-color: var(--accent);
    }
    .je-ready input[type=checkbox] { width: auto; accent-color: var(--accent); }
    .je-ready select option { background: var(--bg3); }
    .je-ready .je-object__container { padding: 0; }
    .je-ready .je-indented-panel {
      border-left: 2px solid var(--border); margin: 4px 0 4px 8px; padding: 6px 0 6px 12px;
    }
    .je-ready .row { margin-bottom: 14px; }
    .je-ready .btn { display: none; }

    /* Save bar */
    .save-bar {
      position: sticky; bottom: 0; background: var(--bg); border-top: 1px solid var(--border);
      padding: 12px 0; margin-top: 24px; display: flex; align-items: center; gap: 12px;
    }
    .btn-save {
      background: var(--accent); color: #fff; border: none; border-radius: var(--radius);
      padding: 6px 18px; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .btn-save:hover { background: var(--accent-hover); }
    .save-hint { font-size: 12px; color: var(--text2); }
  </style>
</head>
<body>
  <div class="header">
    <h1>Edit Schema: <span style="font-weight:400;color:var(--text2)">${filename}</span></h1>
    <button class="btn-file" onclick="openFile()" title="Open raw JSON file in editor">Open file ↗</button>
  </div>
  <p class="subtitle">Common JSON Schema keywords. Save to write back to the file — the preview reloads automatically.</p>
  <div id="editor-container"></div>
  <div class="save-bar">
    <button class="btn-save" onclick="saveSchema()">Save</button>
    <span class="save-hint">Writes to <code>${filename}</code> · preview reloads on save</span>
  </div>

  <script src="${jsonEditorUri}"></script>
  <script>
    const vscode = acquireVsCodeApi();
    const schema   = ${JSON.stringify(SCHEMA_META)};
    const initval  = ${JSON.stringify(currentSchema)};

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
