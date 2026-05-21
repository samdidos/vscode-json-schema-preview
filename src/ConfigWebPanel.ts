import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getPythonInterpreter, ensureInstalled, capture } from './python';
import { CONFIG_FILENAME, findConfigFile } from './PreviewWebPanel';

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

  panel.webview.html = loadingPage();

  try {
    const python = await getPythonInterpreter();
    await ensureInstalled(python);

    const [configSchema, currentConfig] = await Promise.all([
      extractConfigSchema(python),
      Promise.resolve(readCurrentConfig()),
    ]);

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
  // Handles both pydantic v1 (.schema()) and v2 (.model_json_schema())
  const code = [
    'import json, sys',
    'from json_schema_for_humans.generation_configuration import GenerationConfiguration',
    'try: schema = GenerationConfiguration.model_json_schema()',
    'except AttributeError: schema = GenerationConfiguration.schema()',
    'sys.stdout.write(json.dumps(schema))',
  ].join('\n');

  const raw = await capture(python, ['-c', code]);
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Config file helpers
// ---------------------------------------------------------------------------

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

function loadingPage(): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#9d9d9d}</style>
</head><body>Loading configuration schema…</body></html>`;
}

function errorPage(message: string): string {
  const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    :root {
      --bg: #1e1e1e; --bg2: #252526; --bg3: #2d2d30;
      --border: #3c3c3c; --text: #cccccc; --text2: #9d9d9d;
      --accent: #0078d4; --accent-hover: #106ebe;
      --required: #f47067; --radius: 4px;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, 'Segoe UI', sans-serif);
           font-size: 13px; line-height: 1.5; color: var(--text);
           background: var(--bg); margin: 0; padding: 24px 32px 48px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
    .subtitle { color: var(--text2); margin: 0 0 24px; font-size: 12px; }

    /* json-editor overrides */
    .je-ready { color: var(--text); }
    .je-ready h3 { font-size: 13px; font-weight: 600; margin: 0 0 2px; color: var(--text); }
    .je-ready p.je-desc { color: var(--text2); font-size: 12px; margin: 0 0 6px; }
    .je-ready label { display: block; font-size: 12px; font-weight: 600;
                      color: var(--text2); margin-bottom: 4px; }
    .je-ready input[type=text],
    .je-ready input[type=number],
    .je-ready select,
    .je-ready textarea {
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
    .je-ready .btn { display: none; } /* hide json-editor's own buttons */

    /* Save bar */
    .save-bar {
      position: sticky; bottom: 0; background: var(--bg); border-top: 1px solid var(--border);
      padding: 12px 0; margin-top: 24px; display: flex; align-items: center; gap: 12px;
    }
    .btn-save {
      background: var(--accent); color: #fff; border: none; border-radius: var(--radius);
      padding: 6px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s;
    }
    .btn-save:hover { background: var(--accent-hover); }
    .save-hint { font-size: 12px; color: var(--text2); }
    .config-path { font-family: monospace; font-size: 11px; color: var(--text2); margin-top: 2px; }
  </style>
</head>
<body>
  <h1>JSON Schema Preview — Configuration</h1>
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
