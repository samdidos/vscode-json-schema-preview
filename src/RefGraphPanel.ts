// Coverage excluded: this file creates a VS Code WebviewPanel. The panel is
// static (script-free) HTML/SVG — all graph logic lives in the pure, unit-tested
// `refGraph` module; this file is only the VS Code wiring, verified manually and
// via E2E. F24-FR-02: locked-down CSP, no scripts, no remote resources.
import * as vscode from 'vscode';
import * as path from 'path';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { parseSchemaText } from './schemaPointer';
import { sanitizeHtml } from './webviewUtils';
import {
  buildRefGraph,
  layoutGraph,
  renderGraphSvg,
  renderAdjacencyList,
  summarizeGraph,
  detectCycle,
} from './refGraph';

/** Register the $ref graph command (F24-FR-01). */
export function registerRefGraph(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonschema.refGraph', () => openRefGraph(context)),
  );
}

function openRefGraph(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isJsonSchemaFile(editor.document)) {
    vscode.window.showInformationMessage('Open a JSON Schema file to view its $ref graph.');
    return;
  }
  const doc = editor.document;
  const schema = parseSchemaText(doc.getText(), doc.languageId);
  if (schema === undefined) {
    vscode.window.showErrorMessage('Cannot parse the current schema file.');
    return;
  }

  const graph = buildRefGraph(schema);
  if (graph.edges.length === 0) {
    vscode.window.showInformationMessage('This schema declares no $ref — nothing to graph.');
    return;
  }

  const title = path.basename(doc.uri.fsPath);
  const panel = vscode.window.createWebviewPanel(
    'jsonschema-refgraph',
    `$ref graph: ${title}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false, retainContextWhenHidden: true },
  );
  panel.webview.html = buildGraphPage(graph, title);
}

/** Static, script-free HTML for the graph panel. */
function buildGraphPage(graph: ReturnType<typeof buildRefGraph>, title: string): string {
  const svg = renderGraphSvg(layoutGraph(graph));
  const adjacency = sanitizeHtml(renderAdjacencyList(graph));
  const summary = sanitizeHtml(summarizeGraph(graph));
  const cycle = detectCycle(graph);
  const cycleNote = cycle
    ? `<p class="warn">⚠ Reference cycle: ${sanitizeHtml(cycle.join(' → '))}</p>`
    : '';
  const unresolvedNote = graph.unresolved.length
    ? `<p class="warn">⚠ Unresolved references: ${sanitizeHtml(graph.unresolved.join(', '))}</p>`
    : '';

  const csp =
    `<meta http-equiv="Content-Security-Policy" ` +
    `content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${csp}
<title>$ref graph: ${sanitizeHtml(title)}</title>
<style>
  body { font-family: var(--vscode-font-family, sans-serif); color: #d4d4d4; background: #1e1e1e; margin: 0; padding: 24px 28px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #9d9d9d; margin: 24px 0 8px; }
  .summary { color: #9d9d9d; font-size: 12px; margin: 0 0 16px; }
  .warn { color: #f0a44a; font-size: 12px; margin: 4px 0; }
  .diagram { overflow-x: auto; border: 1px solid #333; border-radius: 6px; padding: 8px; background: #202020; }
  pre { background: #252526; border: 1px solid #333; border-radius: 6px; padding: 12px 16px; font-size: 12px; overflow-x: auto; white-space: pre; }
  .legend { font-size: 12px; color: #9d9d9d; margin-top: 8px; }
  .legend span { margin-right: 14px; }
</style></head>
<body>
  <h1>$ref dependency graph — ${sanitizeHtml(title)}</h1>
  <p class="summary">${summary}</p>
  ${cycleNote}
  ${unresolvedNote}
  <div class="diagram">${svg}</div>
  <p class="legend"><span>▭ definition</span><span>▤ file</span><span>⌾ remote</span><span>⚠ unresolved</span></p>
  <h2>Adjacency</h2>
  <pre>${adjacency}</pre>
</body></html>`;
}
