import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';

let position: { x: number; y: number } = { x: 0, y: 0 };

export const openJsonSchemaFiles: { [id: string]: vscode.WebviewPanel } = {};

// Keyed by interpreter path so switching interpreters triggers a re-check.
const packageReadyFor = new Set<string>();

export function previewJsonSchema(context: vscode.ExtensionContext) {
  return async (uri: vscode.Uri) => {
    uri = uri || ((await promptForJsonSchemaFile()) as vscode.Uri);
    if (uri) {
      openJsonSchema(context, uri);
    }
  };
}

export function isJsonSchemaFile(document?: vscode.TextDocument) {
  if (!document) {
    return false;
  }
  if (document.languageId === 'json') {
    try {
      const json = JSON.parse(document.getText());
      return !!json.$schema;
    } catch (e) {
      return false;
    }
  }
  if (document.languageId === 'yml' || document.languageId === 'yaml') {
    return document.getText().match(/^\$schema:/m) !== null;
  }
  return false;
}

export async function openJsonSchema(context: vscode.ExtensionContext, uri: vscode.Uri) {
  const localResourceRoots = [vscode.Uri.file(path.dirname(uri.fsPath))];
  if (vscode.workspace.workspaceFolders) {
    vscode.workspace.workspaceFolders.forEach(folder => {
      localResourceRoots.push(folder.uri);
    });
  }

  const panel: vscode.WebviewPanel =
    openJsonSchemaFiles[uri.fsPath] ||
    vscode.window.createWebviewPanel('jsonschema-preview', '', vscode.ViewColumn.Two, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots,
    });

  panel.title = path.basename(uri.fsPath);
  panel.webview.html = loadingPage(path.basename(uri.fsPath));
  panel.webview.html = await buildWebviewContent(uri, position);

  panel.webview.onDidReceiveMessage(
    message => {
      if (message.type === 'position') {
        position = { x: message.scrollX, y: message.scrollY };
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => {
    delete openJsonSchemaFiles[uri.fsPath];
  });
  openJsonSchemaFiles[uri.fsPath] = panel;
}

export async function promptForJsonSchemaFile() {
  if (isJsonSchemaFile(vscode.window.activeTextEditor?.document)) {
    return vscode.window.activeTextEditor?.document.uri;
  }
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Open JSON Schema file',
    filters: { 'JSON Schema': ['json', 'yaml', 'yml'] },
  });
  return uris?.[0];
}

// ---------------------------------------------------------------------------
// Python interpreter resolution
// ---------------------------------------------------------------------------

/**
 * Returns the path to the Python interpreter selected in VS Code's Python
 * extension. Falls back to the `python.defaultInterpreterPath` setting, then
 * to `python3` / `python` on PATH.
 */
async function getPythonInterpreter(): Promise<string> {
  try {
    const pyExt = vscode.extensions.getExtension('ms-python.python');
    if (pyExt) {
      if (!pyExt.isActive) {
        await pyExt.activate();
      }
      const api = pyExt.exports;

      // New environments API (Python extension >= 2022.3)
      if (api?.environments?.getActiveEnvironmentPath) {
        const resource = vscode.workspace.workspaceFolders?.[0];
        const envPath = api.environments.getActiveEnvironmentPath(resource);
        if (envPath) {
          // resolveEnvironment gives us the actual executable URI
          if (api.environments.resolveEnvironment) {
            const resolved = await api.environments.resolveEnvironment(envPath);
            const exe = resolved?.executable?.uri?.fsPath;
            if (exe) {
              return exe;
            }
          }
          // Fallback: envPath.path is the interpreter path on most setups
          if (envPath.path) {
            return envPath.path;
          }
        }
      }

      // Legacy API (Python extension < 2022.3)
      if (api?.settings?.getExecutionDetails) {
        const details = api.settings.getExecutionDetails(
          vscode.workspace.workspaceFolders?.[0]?.uri
        );
        const exe = details?.execCommand?.[0];
        if (exe) {
          return exe;
        }
      }
    }
  } catch {
    // Fall through to settings / PATH defaults
  }

  // Read from VS Code settings (set by "Python: Select Interpreter")
  const config = vscode.workspace.getConfiguration('python');
  const fromSettings =
    config.get<string>('defaultInterpreterPath') ?? config.get<string>('pythonPath');
  if (fromSettings && fromSettings !== '' && fromSettings !== 'python' && fromSettings !== 'python3') {
    return fromSettings;
  }

  return 'python3';
}

// ---------------------------------------------------------------------------
// Dependency management
// ---------------------------------------------------------------------------

function run(cmd: string, args: string[], timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: timeoutMs }, err => (err ? reject(err) : resolve()))
  );
}

/**
 * Ensures json-schema-for-humans is installed under the given interpreter.
 * Uses `pip install --user` so the package lands in the user's site-packages
 * without requiring elevated permissions. Falls back to a plain install when
 * running inside a virtual environment (where --user is not applicable).
 */
async function ensureInstalled(python: string): Promise<void> {
  if (packageReadyFor.has(python)) {
    return;
  }

  const alreadyInstalled = await run(python, ['-c', 'import json_schema_for_humans'], 8_000)
    .then(() => true)
    .catch(() => false);

  if (alreadyInstalled) {
    packageReadyFor.add(python);
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'JSON Schema Preview', cancellable: false },
    async progress => {
      progress.report({ message: `Installing json-schema-for-humans into ${path.basename(python)}…` });

      try {
        // --user keeps the install in the user site-packages (no sudo needed)
        await run(python, ['-m', 'pip', 'install', '--user', 'json-schema-for-humans'], 120_000);
      } catch {
        // Inside a venv --user is rejected; retry without it
        await run(python, ['-m', 'pip', 'install', 'json-schema-for-humans'], 120_000);
      }

      packageReadyFor.add(python);
    }
  );
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

async function generateDocHTML(schemaPath: string): Promise<string> {
  const python = await getPythonInterpreter();
  await ensureInstalled(python);

  const outFile = path.join(os.tmpdir(), `json-schema-preview-${Date.now()}.html`);
  const args = [
    '-m', 'json_schema_for_humans.generate',
    '--config', 'template_name=flat',
    schemaPath,
    outFile,
  ];

  try {
    await run(python, args);
  } catch (e) {
    throw new Error(`Generation failed (interpreter: ${python}): ${(e as Error).message}`);
  }

  const html = fs.readFileSync(outFile, 'utf-8');
  try { fs.unlinkSync(outFile); } catch { /* ignore */ }
  return html;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const scrollScript = (x: number, y: number) => `
<script>
  try {
    const vscode = acquireVsCodeApi();
    window.addEventListener('scrollend', function () {
      vscode.postMessage({ type: 'position', scrollX: window.scrollX || 0, scrollY: window.scrollY || 0 });
    });
    window.addEventListener('load', function () {
      setTimeout(function () { window.scrollTo(${x}, ${y}); }, 150);
    });
  } catch (e) { /* running outside VS Code */ }
</script>`;

function injectScript(html: string, script: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, script + '</body>');
  }
  return html + script;
}

function loadingPage(filename: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#9d9d9d}</style>
</head><body>Generating preview for <em>${filename}</em>…</body></html>`;
}

function errorPage(message: string): string {
  const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#d4d4d4}
  h2{color:#f47067;margin-top:0}
  pre{background:#252526;border:1px solid #3c3c3c;border-radius:6px;padding:16px;white-space:pre-wrap;font-size:13px}
</style></head>
<body>
  <h2>JSON Schema Preview — Error</h2>
  <pre>${safe}</pre>
</body></html>`;
}

async function buildWebviewContent(uri: vscode.Uri, pos: { x: number; y: number }): Promise<string> {
  try {
    const html = await generateDocHTML(uri.fsPath);
    return injectScript(html, scrollScript(pos.x, pos.y));
  } catch (err) {
    return errorPage(String(err));
  }
}
