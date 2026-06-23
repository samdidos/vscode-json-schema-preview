import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getPythonInterpreter, ensureInstalled, run } from './python';
import { isYaml, stripJsoncComments } from './languages';
import { loadingPage, errorPage as renderErrorPage, sanitizeHtml, getNonce } from './webviewUtils';

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
  if (document.languageId === 'json' || document.languageId === 'jsonc') {
    try {
      const text = document.languageId === 'jsonc'
        ? stripJsoncComments(document.getText())
        : document.getText();
      const json = JSON.parse(text);
      return !!json.$schema;
    } catch {
      return false;
    }
  }
  if (isYaml(document.languageId)) {
    return document.getText().match(/^\$schema:/m) !== null;
  }
  // jsonl files are always data, never schemas
  return false;
}

export function disposeAllPanels(): void {
  for (const panel of Object.values(openJsonSchemaFiles)) {
    panel.dispose();
  }
}

/* c8 ignore start — webview lifecycle and Python subprocess; covered by manual/E2E testing */
export async function openJsonSchema(context: vscode.ExtensionContext, uri: vscode.Uri, silent = false) {
  // The preview renders by running a local Python tool, so it is gated on
  // Workspace Trust (declared as `untrustedWorkspaces: limited` in package.json).
  // Auto-preview passes `silent` so it skips quietly; the explicit command
  // explains why nothing happened and offers the trust dialog.
  if (!vscode.workspace.isTrusted) {
    if (!silent) {
      const choice = await vscode.window.showWarningMessage(
        'JSON Schema Preview runs a local Python tool to render the preview, which is disabled in untrusted workspaces.',
        'Manage Workspace Trust',
      );
      if (choice === 'Manage Workspace Trust') {
        vscode.commands.executeCommand('workbench.trust.manage');
      }
    }
    return;
  }

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
  panel.webview.html = loadingPage(`Generating preview for <em>${path.basename(uri.fsPath)}</em>…`);
  panel.webview.html = await buildWebviewContent(uri.fsPath, uri, position);

  panel.webview.onDidReceiveMessage(
    async message => {
      if (message.type === 'position') {
        position = { x: message.scrollX, y: message.scrollY };
      } else if (message.type === 'openExternal') {
        try {
          await vscode.env.openExternal(vscode.Uri.parse(message.href as string));
        } catch {
          vscode.window.showErrorMessage(`Cannot open: ${message.href}`);
        }
      } else if (message.type === 'download') {
        const cached = rawOutputCache.get(uri.fsPath);
        if (!cached) return;
        const stem = path.basename(uri.fsPath, path.extname(uri.fsPath));
        const defaultUri = vscode.Uri.file(path.join(path.dirname(uri.fsPath), `${stem}.${cached.ext}`));
        const dest = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { 'Generated output': [cached.ext] },
          saveLabel: 'Save Preview',
        });
        if (!dest) return;
        fs.writeFileSync(dest.fsPath, cached.content, 'utf-8');
        vscode.window.showInformationMessage(`Preview saved to ${path.basename(dest.fsPath)}`);
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => {
    rawOutputCache.delete(uri.fsPath);
    delete openJsonSchemaFiles[uri.fsPath];
  });
  openJsonSchemaFiles[uri.fsPath] = panel;
}

// Debounce map for live preview; keyed by file path
const liveTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Cache of the raw generated output keyed by the original document fsPath.
// Stores both content and file extension so the download button uses the right format.
interface CachedOutput { content: string; ext: string; }
const rawOutputCache = new Map<string, CachedOutput>();

export function scheduleLiveUpdate(_context: vscode.ExtensionContext, doc: vscode.TextDocument): void {
  const panel = openJsonSchemaFiles[doc.uri.fsPath];
  if (!panel) return; // preview not open — nothing to refresh
  if (!vscode.workspace.isTrusted) return; // never run Python in an untrusted workspace

  const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
  const delay = Math.max(500, cfg.get<number>('liveUpdateDelay') ?? 1500);

  const existing = liveTimers.get(doc.uri.fsPath);
  if (existing) clearTimeout(existing);

  liveTimers.set(doc.uri.fsPath, setTimeout(async () => {
    liveTimers.delete(doc.uri.fsPath);
    if (!openJsonSchemaFiles[doc.uri.fsPath]) return; // panel closed during delay

    // Write current (unsaved) text to a temp file so Python can read it.
    // JSONC: strip comments first — Python's json parser doesn't handle them.
    // Always use .json extension so json_schema_for_humans infers the format.
    const isJsonc = doc.languageId === 'jsonc';
    const ext = isJsonc ? '.json' : (path.extname(doc.uri.fsPath) || '.json');
    const tmpPath = path.join(os.tmpdir(), `jspreview-live-${Date.now()}${ext}`);
    try {
      const content = isJsonc ? stripJsoncComments(doc.getText()) : doc.getText();
      fs.writeFileSync(tmpPath, content, 'utf-8');
      panel.webview.html = loadingPage(`Generating preview for <em>${path.basename(doc.uri.fsPath)}</em>…`);
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
  if (!vscode.workspace.isTrusted) {
    throw new Error('Preview generation is disabled in untrusted workspaces.');
  }
  const python = await getPythonInterpreter();
  await ensureInstalled(python);

  const outFile = path.join(os.tmpdir(), `json-schema-preview-${Date.now()}.html`);

  const args: string[] = ['-m', 'json_schema_for_humans.cli'];

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

/** Returns { ext, isHtml } by reading template_name from the config file. */
function detectOutputFmt(configFile?: string): { ext: string; isHtml: boolean } {
  if (configFile) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as { template_name?: string };
      if (/^md/i.test(cfg.template_name ?? '')) return { ext: 'md', isHtml: false };
    } catch { /* fall through */ }
  }
  return { ext: 'html', isHtml: true };
}

/** Wraps raw non-HTML output (e.g. Markdown) in a minimal HTML page for display. */
function wrapAsHtml(content: string, ext: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:'Cascadia Code','Consolas',monospace;padding:32px;background:#1e1e1e;
       color:#d4d4d4;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;margin:0}
  .fmt-label{font-family:sans-serif;font-size:11px;color:#6a9955;margin-bottom:16px;display:block}
</style>
</head><body><span class="fmt-label">${sanitizeHtml(ext.toUpperCase())} — raw source (download to view rendered)</span>${sanitizeHtml(content)}</body></html>`;
}

function buildInjection(x: number, y: number, ext: string, nonce: string): string {
  const label = `&#8595; Download ${ext.toUpperCase()}`;
  return `
<div id="_jspreview_dl_wrap" style="position:fixed;bottom:20px;right:20px;z-index:9999;">
  <button id="_jspreview_dl" style="background:#0078d4;color:#fff;border:none;border-radius:4px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);">${label}</button>
</div>
<script nonce="${nonce}">
  (function () {
    try {
      var vsc = acquireVsCodeApi();
      window.addEventListener('scrollend', function () {
        vsc.postMessage({ type: 'position', scrollX: window.scrollX || 0, scrollY: window.scrollY || 0 });
      });
      window.addEventListener('load', function () {
        setTimeout(function () { window.scrollTo(${x}, ${y}); }, 150);
      });
      document.getElementById('_jspreview_dl').addEventListener('click', function () {
        vsc.postMessage({ type: 'download' });
      });
      document.addEventListener('click', function (e) {
        var a = e.target.closest('a[href]');
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        e.preventDefault();
        vsc.postMessage({ type: 'openExternal', href: a.href });
      });
    } catch (e) { /* running outside VS Code */ }
  })();
</script>`;
}

function injectScript(html: string, script: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, script + '</body>');
  }
  return html + script;
}

/**
 * Inserts a CSP and stamps `nonce` onto every `<script>` element in the
 * generated document. json-schema-for-humans escapes schema-derived content
 * into HTML text/attributes, so the only scripts present are the template's
 * own — stamping them lets them run under a nonce-based policy while a script
 * injected through any other channel (which would not carry the nonce) is
 * blocked. `style-src` keeps `'unsafe-inline'` because templates rely on inline
 * style attributes (styles cannot carry a nonce and pose no code-execution risk);
 * CDN fonts/styles are still permitted so non-flat templates render.
 */
function allowExternalResources(html: string, nonce: string): string {
  const stamped = html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
  const csp = `<meta http-equiv="Content-Security-Policy" ` +
    `content="default-src 'none'; script-src 'nonce-${nonce}'; ` +
    `style-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:;">`;
  if (/<meta[^>]+Content-Security-Policy[^>]*>/i.test(stamped)) {
    return stamped.replace(/<meta[^>]+Content-Security-Policy[^>]*>/i, csp);
  }
  if (/<head[^>]*>/i.test(stamped)) {
    return stamped.replace(/<head[^>]*>/i, m => `${m}\n  ${csp}`);
  }
  return stamped;
}

function errorPage(message: string): string {
  let hint = '';
  if (/spawn.*ENOENT|python.*not found|No such file/i.test(message)) {
    hint = `<div class="hint">
      <strong>Python not found.</strong> Make sure Python 3 is installed and on your PATH,
      or install the VS Code Python extension and select an interpreter.<br>
      <code>pip install json-schema-for-humans</code>
    </div>`;
  } else if (/pip is not available|No module named pip/i.test(message)) {
    hint = `<div class="hint">
      <strong>pip is not installed.</strong> Install it first, then re-open the preview:<br>
      <code>sudo apt install python3-pip</code> &nbsp;— Ubuntu / Debian<br>
      <code>python3 -m ensurepip --upgrade</code> &nbsp;— macOS / other<br>
      Then: <code>pip3 install json-schema-for-humans</code>
    </div>`;
  } else if (/pip install|ModuleNotFoundError|No module named/i.test(message)) {
    hint = `<div class="hint">
      <strong>Missing Python package.</strong> Install it manually:<br>
      <code>pip3 install json-schema-for-humans</code>
    </div>`;
  } else if (/timed? ?out/i.test(message)) {
    hint = `<div class="hint">
      <strong>Generation timed out.</strong>
      The schema may be very large or contain slow remote <code>$ref</code> lookups.
      Try simplifying the schema or check your network connection.
    </div>`;
  }

  return renderErrorPage('JSON Schema Preview — Error', message, hint);
}

async function buildWebviewContent(
  schemaPath: string,
  forUri: vscode.Uri,
  pos: { x: number; y: number }
): Promise<string> {
  try {
    const content = await generateDocHTML(schemaPath, forUri);
    const fmt = detectOutputFmt(findConfigFile(forUri));
    rawOutputCache.set(forUri.fsPath, { content, ext: fmt.ext });
    const nonce = getNonce();
    const rendered = fmt.isHtml ? content : wrapAsHtml(content, fmt.ext);
    const displayHtml = allowExternalResources(rendered, nonce);
    return injectScript(displayHtml, buildInjection(pos.x, pos.y, fmt.ext, nonce));
  } catch (err) {
    return errorPage(String(err));
  }
}
/* c8 ignore stop */
