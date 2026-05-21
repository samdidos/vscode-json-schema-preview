import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';

let position: { x: number; y: number } = { x: 0, y: 0 };

export const openJsonSchemaFiles: { [id: string]: vscode.WebviewPanel } = {};

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

  // Show a loading state immediately, then fill with the generated HTML
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
// json-schema-for-humans integration
// ---------------------------------------------------------------------------

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 30_000 }, err => (err ? reject(err) : resolve()))
  );
}

async function generateDocHTML(schemaPath: string): Promise<string> {
  const outFile = path.join(os.tmpdir(), `json-schema-preview-${Date.now()}.html`);

  // Use the flat template: pure HTML/CSS, no external CDN or JS required,
  // renders correctly in VS Code's sandboxed webview out of the box.
  const toolArgs = ['--config', 'template_name=flat', schemaPath, outFile];

  // Try three invocation styles to cover different install locations.
  const attempts: Array<() => Promise<void>> = [
    () => run('generate-schema-doc', toolArgs),
    () => run('python3', ['-m', 'json_schema_for_humans.generate', ...toolArgs]),
    () => run('python', ['-m', 'json_schema_for_humans.generate', ...toolArgs]),
  ];

  let lastErr: Error | undefined;
  for (const attempt of attempts) {
    try {
      await attempt();
      const html = fs.readFileSync(outFile, 'utf-8');
      try { fs.unlinkSync(outFile); } catch { /* ignore */ }
      return html;
    } catch (e) {
      lastErr = e as Error;
    }
  }

  throw new Error(
    `json-schema-for-humans not found.\n\n` +
    `Install it with:\n  pip install json-schema-for-humans\n\n` +
    `Then make sure the "generate-schema-doc" command (or python3) is on your PATH.\n\n` +
    `Details: ${lastErr?.message ?? 'unknown error'}`
  );
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
  code{background:#252526;padding:2px 6px;border-radius:3px;font-family:monospace}
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
