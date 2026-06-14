// Coverage excluded: this file creates a VS Code WebviewPanel and calls Python
// to extract a JSON Schema from a Pydantic model at runtime. Both the webview
// lifecycle and the Python subprocess require a live environment that cannot be
// replicated in unit tests without heavy mocking.
// Covered by manual and end-to-end testing instead.
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getPythonInterpreter, ensureInstalled, capture } from './python';
import { CONFIG_FILENAME, findConfigFile } from './PreviewWebPanel';
import { loadingPage, sanitizeHtml, JE_PANEL_CSS } from './webviewUtils';

let panel: vscode.WebviewPanel | undefined;

export async function openConfigPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'jsonschema-config',
    'JSON Schema Preview — Configuration',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = loadingPage('Loading configuration schema…');

  try {
    const python = await getPythonInterpreter();
    await ensureInstalled(python);

    const [configSchema, currentConfig] = await Promise.all([
      extractConfigSchema(python),
      Promise.resolve(readCurrentConfig()),
    ]);

    // Register the public config schema so VS Code's JSON language server
    // provides autocomplete when editing the config file directly.
    ensureConfigSchemaBinding().catch(() => { /* non-fatal */ });

    const jsonEditorUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'jsoneditor.js')
    );

    panel.webview.html = buildConfigPage(jsonEditorUri, configSchema, currentConfig);
  } catch (err) {
    panel.webview.html = errorPage(String(err));
  }

  panel.webview.onDidReceiveMessage(async message => {
    if (message.type === 'save') {
      await saveConfig(message.config);
    } else if (message.type === 'openFile') {
      await openConfigFile();
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

// ---------------------------------------------------------------------------
// Config schema extraction
// ---------------------------------------------------------------------------

async function extractConfigSchema(python: string): Promise<object> {
  // GenerationConfiguration uses dataclasses_json (marshmallow), not pydantic.
  // .schema() returns an unserializable marshmallow Schema object, so we
  // introspect the dataclass fields directly and build the JSON Schema ourselves.
  const code = [
    'import json, sys, os, dataclasses, typing, pathlib',
    'from json_schema_for_humans.generation_configuration import GenerationConfiguration',
    'MISSING = dataclasses.MISSING',
    'def jstype(t):',
    '    o = getattr(t, "__origin__", None)',
    '    args = getattr(t, "__args__", ())',
    '    if o is typing.Union:',
    '        nn = [a for a in args if a is not type(None)]',
    '        return jstype(nn[0]) if nn else "string"',
    '    if t is bool: return "boolean"',
    '    if t is int: return "integer"',
    '    if t is float: return "number"',
    '    if t in (str, pathlib.Path): return "string"',
    '    if o is dict: return "object"',
    '    if o is list: return "array"',
    '    return "string"',
    'cfg0 = GenerationConfiguration()',
    'tdir = pathlib.Path(cfg0.templates_directory)',
    'templates = sorted([d for d in os.listdir(tdir) if (tdir / d).is_dir()])',
    'ns = {**vars(typing), "pathlib": pathlib, "Path": pathlib.Path}',
    'props = {}',
    'for f in dataclasses.fields(GenerationConfiguration):',
    '    if f.name == "templates_directory": continue',
    '    t = f.type',
    '    if isinstance(t, str):',
    '        try: t = eval(t, ns)',
    '        except: t = str',
    '    prop = {"type": jstype(t)}',
    '    d = f.default if f.default is not MISSING else (f.default_factory() if f.default_factory is not MISSING else MISSING)',
    '    if d is not MISSING:',
    '        v = str(d) if isinstance(d, pathlib.Path) else d',
    '        if isinstance(v, (bool, int, float, str)): prop["default"] = v',
    '    if f.name == "template_name": prop["enum"] = templates',
    '    props[f.name] = prop',
    'sys.stdout.write(json.dumps({"type": "object", "properties": props}))',
  ].join('\n');

  const raw = await capture(python, ['-c', code]);
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Config file helpers
// ---------------------------------------------------------------------------

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

function readCurrentConfig(): object {
  const existing = findConfigFile();
  if (!existing) return {};
  try {
    return JSON.parse(fs.readFileSync(existing, 'utf-8'));
  } catch {
    return {};
  }
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

async function saveConfig(config: object): Promise<void> {
  let filePath: string;
  try {
    filePath = getConfigFilePath();
  } catch (err) {
    vscode.window.showErrorMessage(String(err));
    return;
  }

  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  const rel = vscode.workspace.asRelativePath(filePath);
  vscode.window.showInformationMessage(`JSON Schema Preview config saved to ${rel}`);
}

// ---------------------------------------------------------------------------
// Webview HTML
// ---------------------------------------------------------------------------

function errorPage(message: string): string {
  const safe = sanitizeHtml(message);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#d4d4d4}
  h2{color:#f47067}
  pre{background:#252526;border:1px solid #3c3c3c;border-radius:6px;padding:16px;white-space:pre-wrap}
</style></head>
<body><h2>Configuration — Error</h2><pre>${safe}</pre></body></html>`;
}

function buildConfigPage(jsonEditorUri: vscode.Uri, schema: object, currentConfig: object): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSON Schema Preview — Configuration</title>
  <style>
    ${JE_PANEL_CSS}
    .config-path { font-family: monospace; font-size: 11px; color: var(--text2); margin-top: 2px; }
  </style>
</head>
<body>
  <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px">
    <h1 style="margin:0">JSON Schema Preview — Configuration</h1>
    <button class="btn-file" onclick="openFile()" title="Open raw config file in editor">Open file ↗</button>
  </div>
  <p class="subtitle">
    Settings are saved to <code>${CONFIG_FILENAME}</code> in your workspace root
    and picked up automatically on the next render.
  </p>
  <div id="editor-container"></div>
  <div class="save-bar">
    <button class="btn-save" onclick="saveConfig()">Save</button>
    <span class="save-hint">Saves to workspace root · reloaded on next preview</span>
  </div>

  <script src="${jsonEditorUri}"></script>
  <script>
    const vscode = acquireVsCodeApi();
    const schema  = ${JSON.stringify(schema)};
    const initval = ${JSON.stringify(currentConfig)};

    const editor = new JSONEditor(document.getElementById('editor-container'), {
      schema,
      startval: initval,
      theme: 'barebones',
      iconlib: false,
      disable_edit_json: true,
      disable_properties: true,
      disable_collapse: false,
      no_additional_properties: true,
    });

    // Mark the container once the editor is ready so our CSS kicks in
    editor.on('ready', () => {
      document.getElementById('editor-container').classList.add('je-ready');
    });

    function openFile() {
      vscode.postMessage({ type: 'openFile' });
    }

    function saveConfig() {
      const errors = editor.validate();
      if (errors.length) {
        alert('Please fix the following errors before saving:\\n\\n' +
          errors.map(e => e.path + ': ' + e.message).join('\\n'));
        return;
      }
      vscode.postMessage({ type: 'save', config: editor.getValue() });
    }
  </script>
</body>
</html>`;
}
