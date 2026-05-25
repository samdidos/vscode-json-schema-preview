import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getPythonInterpreter, ensureInstalled, run } from './python';

let position: { x: number; y: number } = { x: 0, y: 0 };

export const openJsonSchemaFiles: { [id: string]: vscode.WebviewPanel } = {};

export const CONFIG_FILENAME = '.json-schema-preview-config.json';

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

export function disposeAllPanels(): void {
  for (const panel of Object.values(openJsonSchemaFiles)) {
    panel.dispose();
  }
}

/* c8 ignore start — webview lifecycle and Python subprocess; covered by manual/E2E testing */
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
  panel.webview.html = await buildWebviewContent(uri.fsPath, uri, position);

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

// Debounce map for live preview; keyed by file path
const liveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleLiveUpdate(context: vscode.ExtensionContext, doc: vscode.TextDocument): void {
  const panel = openJsonSchemaFiles[doc.uri.fsPath];
  if (!panel) return; // preview not open — nothing to refresh

  const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
  const delay = Math.max(500, cfg.get<number>('liveUpdateDelay') ?? 1500);

  const existing = liveTimers.get(doc.uri.fsPath);
  if (existing) clearTimeout(existing);

  liveTimers.set(doc.uri.fsPath, setTimeout(async () => {
    liveTimers.delete(doc.uri.fsPath);
    if (!openJsonSchemaFiles[doc.uri.fsPath]) return; // panel closed during delay

    // Write current (unsaved) text to a temp file so Python can read it
    const ext = path.extname(doc.uri.fsPath) || '.json';
    const tmpPath = path.join(os.tmpdir(), `jspreview-live-${Date.now()}${ext}`);
    try {
      fs.writeFileSync(tmpPath, doc.getText(), 'utf-8');
      panel.webview.html = loadingPage(path.basename(doc.uri.fsPath));
      const html = await buildWebviewContent(tmpPath, doc.uri, position);
      if (openJsonSchemaFiles[doc.uri.fsPath] === panel) {
        panel.webview.html = html;
      }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }, delay));
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
// Config file helpers (multi-root aware)
// ---------------------------------------------------------------------------

export function findConfigFile(forUri?: vscode.Uri): string | undefined {
  const roots: string[] = [];

  // Prioritise the workspace folder that owns the schema file being rendered
  if (forUri) {
    const folder = vscode.workspace.getWorkspaceFolder(forUri);
    if (folder) roots.push(folder.uri.fsPath);
  }

  // Fall back to remaining workspace folders in order
  (vscode.workspace.workspaceFolders ?? []).forEach(f => {
    if (!roots.includes(f.uri.fsPath)) roots.push(f.uri.fsPath);
  });

  for (const root of roots) {
    const candidate = path.join(root, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

async function generateDocHTML(schemaPath: string, forUri?: vscode.Uri): Promise<string> {
  const python = await getPythonInterpreter();
  await ensureInstalled(python);

  const outFile = path.join(os.tmpdir(), `json-schema-preview-${Date.now()}.html`);

  const args: string[] = ['-m', 'json_schema_for_humans.generate'];

  const configFile = findConfigFile(forUri);
  if (configFile) {
    args.push('--config-file', configFile);
  } else {
    // Default to the flat template which works in VS Code's sandboxed webview
    args.push('--config', 'template_name=flat');
  }

  args.push(schemaPath, outFile);

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

/** Replace or insert a permissive CSP so that templates referencing CDN
 *  fonts/styles (e.g. non-flat templates) render correctly in the webview. */
function allowExternalResources(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" ` +
    `content="default-src 'none'; script-src 'unsafe-inline'; ` +
    `style-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:;">`;
  if (/<meta[^>]+Content-Security-Policy[^>]*>/i.test(html)) {
    return html.replace(/<meta[^>]+Content-Security-Policy[^>]*>/i, csp);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, m => `${m}\n  ${csp}`);
  }
  return html;
}

function loadingPage(filename: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#9d9d9d}</style>
</head><body>Generating preview for <em>${filename}</em>…</body></html>`;
}

function errorPage(message: string): string {
  const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let hint = '';
  if (/spawn.*ENOENT|python.*not found|No such file/i.test(message)) {
    hint = `<div class="hint">
      <strong>Python not found.</strong> Make sure Python 3 is installed and on your PATH,
      or install the VS Code Python extension and select an interpreter.<br>
      <code>pip install json-schema-for-humans</code>
    </div>`;
  } else if (/pip install|ModuleNotFoundError|No module named/i.test(message)) {
    hint = `<div class="hint">
      <strong>Missing Python package.</strong> Install it manually:<br>
      <code>pip install json-schema-for-humans</code>
    </div>`;
  } else if (/timed? ?out/i.test(message)) {
    hint = `<div class="hint">
      <strong>Generation timed out.</strong>
      The schema may be very large or contain slow remote <code>$ref</code> lookups.
      Try simplifying the schema or check your network connection.
    </div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#d4d4d4}
  h2{color:#f47067;margin-top:0}
  pre{background:#252526;border:1px solid #3c3c3c;border-radius:6px;padding:16px;white-space:pre-wrap;font-size:13px}
  .hint{margin-top:16px;padding:12px 16px;background:#252526;border-left:3px solid #f47067;border-radius:4px;font-size:13px;line-height:1.6}
  .hint code{background:#1e1e1e;padding:2px 6px;border-radius:3px;font-family:monospace}
</style></head>
<body>
  <h2>JSON Schema Preview — Error</h2>
  <pre>${safe}</pre>${hint}
</body></html>`;
}

async function buildWebviewContent(
  schemaPath: string,
  forUri: vscode.Uri,
  pos: { x: number; y: number }
): Promise<string> {
  try {
    const html = await generateDocHTML(schemaPath, forUri);
    return injectScript(allowExternalResources(html), scrollScript(pos.x, pos.y));
  } catch (err) {
    return errorPage(String(err));
  }
}
/* c8 ignore stop */
