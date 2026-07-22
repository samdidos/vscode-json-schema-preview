// Coverage excluded: this file creates a VS Code WebviewPanel. The panel is
// static (script-free) HTML/SVG — all graph logic lives in the pure, unit-tested
// `refGraph` module; this file is only the VS Code wiring, verified manually and
// via E2E. F24-FR-02: locked-down CSP, no scripts, no remote resources.
import * as vscode from 'vscode';
import * as path from 'path';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { parseSchemaText } from './schemaPointer';
import { sanitizeHtml } from './webviewUtils';
import { SchemaAuthManager } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { makeResolver, trackProgress } from './SchemaBundleCommand';
import { getRefGraphMaxDepth } from './settings';
import {
  buildRefGraph,
  layoutGraph,
  renderGraphSvg,
  renderAdjacencyList,
  summarizeGraph,
  detectCycle,
  expandRefGraph,
  type RefGraph,
} from './refGraph';

/** Register the $ref graph command (F24-FR-01). */
export function registerRefGraph(context: vscode.ExtensionContext, auth: SchemaAuthManager, cache: SchemaCache): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonschema.refGraph', () => openRefGraph(context, auth, cache)),
  );
}

async function openRefGraph(context: vscode.ExtensionContext, auth: SchemaAuthManager, cache: SchemaCache): Promise<void> {
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

  let graph = buildRefGraph(schema);
  if (graph.edges.length === 0) {
    vscode.window.showInformationMessage('This schema declares no $ref — nothing to graph.');
    return;
  }

  // F24-FR-08: offer to resolve external refs over the network, opt-in and
  // asked every time — never automatic, never offered in an untrusted
  // workspace (S02), where the network step below would be refused anyway.
  const externalCount = graph.nodes.filter((n) => n.kind === 'relative' || n.kind === 'remote').length;
  if (externalCount > 0 && vscode.workspace.isTrusted) {
    const choice = await vscode.window.showInformationMessage(
      `This schema has ${externalCount} external reference${externalCount === 1 ? '' : 's'}. ` +
        'Resolve them over the network to include their contents in the graph?',
      'Resolve',
      'Skip',
    );
    if (choice === 'Resolve') {
      const resolved = await resolveExternalRefs(graph, doc.uri.fsPath, auth, cache);
      if (resolved === undefined) { return; } // cancelled
      graph = resolved;
    }
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

/**
 * Fetch and merge external refs into `graph` (F24-FR-09/10/11), reusing the
 * same auth/cache-backed resolver as F14 bundling, under a cancellable
 * progress notification. Returns `undefined` if the user cancels. A 401/403
 * offers the standard *Configure Auth* action once per distinct host
 * (F24-FR-12) rather than once per failing ref.
 */
async function resolveExternalRefs(
  graph: RefGraph,
  rootFsPath: string,
  auth: SchemaAuthManager,
  cache: SchemaCache,
): Promise<RefGraph | undefined> {
  const resolve = makeResolver(auth, cache, rootFsPath);
  let result: RefGraph | undefined;
  let canceled = false;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Resolving $ref graph…', cancellable: true },
    async (progress, token) => {
      try {
        result = await expandRefGraph(graph, trackProgress(resolve, progress, token), {
          maxDepth: getRefGraphMaxDepth(),
        });
      } catch (e) {
        if ((e as Error).name === 'Canceled' || (e as Error).message === 'Canceled') {
          canceled = true;
        } else {
          vscode.window.showErrorMessage(`Resolving the $ref graph failed: ${(e as Error).message}`);
        }
      }
    },
  );
  if (canceled || !result) { return undefined; }

  const authHosts = new Set(
    result.errors
      .filter((e) => e.authUrl)
      .map((e) => SchemaAuthManager.hostOf(e.authUrl!)),
  );
  for (const host of authHosts) {
    const url = result.errors.find((e) => e.authUrl && SchemaAuthManager.hostOf(e.authUrl) === host)!.authUrl!;
    await SchemaAuthManager.offerConfigureAuth('A referenced schema at', url);
  }
  return result;
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
  const errorsNote = graph.errors.length
    ? `<p class="warn">⚠ Failed to resolve: ${sanitizeHtml(graph.errors.map((e) => `${e.ref} (${e.message})`).join(', '))}</p>`
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
  ${errorsNote}
  <div class="diagram">${svg}</div>
  <p class="legend"><span>▭ definition</span><span>▤ file</span><span>⌾ remote</span><span>⚠ unresolved / error</span></p>
  <h2>Adjacency</h2>
  <pre>${adjacency}</pre>
</body></html>`;
}
