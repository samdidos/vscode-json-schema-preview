import * as vscode from 'vscode';
import { SchemaAuthManager } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';

// Matches error messages emitted by VS Code's JSON language server and the
// Red Hat YAML extension when they cannot fetch a remote schema.
const SCHEMA_LOAD_ERROR_RE =
  /unable to load schema|cannot get content|failed to load|request.*failed|could not resolve/i;

export class SchemaAuthCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(
    private readonly auth: SchemaAuthManager,
    private readonly cache: SchemaCache,
  ) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const url = extractSchemaUrlFromLine(document, range.start.line);
    if (!url || !SchemaAuthManager.isRemoteUrl(url)) { return []; }

    const host = SchemaAuthManager.hostOf(url);
    const schemaLoadDiags = context.diagnostics.filter((d: vscode.Diagnostic) =>
      SCHEMA_LOAD_ERROR_RE.test(d.message)
    );

    const actions: vscode.CodeAction[] = [];

    // ── Primary: configure authentication ────────────────────────────────────
    const authAction = new vscode.CodeAction(
      `$(lock) Configure authentication for ${host}…`,
      vscode.CodeActionKind.QuickFix,
    );
    authAction.command = {
      command: 'jsonschema.configureSchemaAuth',
      title: 'Configure Schema Authentication',
      arguments: [url],
    };
    // Associate with the schema-load diagnostics so the lightbulb fires.
    if (schemaLoadDiags.length > 0) {
      authAction.diagnostics = schemaLoadDiags;
      authAction.isPreferred = true;
    }
    actions.push(authAction);

    // ── Secondary: cache / refresh ────────────────────────────────────────────
    if (this.cache.isCached(url)) {
      const refreshAction = new vscode.CodeAction(
        `$(refresh) Refresh cached schema from ${host}`,
        vscode.CodeActionKind.QuickFix,
      );
      refreshAction.command = {
        command: 'jsonschema.refreshSchemaCache',
        title: 'Refresh Schema Cache',
        arguments: [url],
      };
      if (schemaLoadDiags.length > 0) refreshAction.diagnostics = schemaLoadDiags;
      actions.push(refreshAction);
    } else {
      const cacheAction = new vscode.CodeAction(
        `$(cloud-download) Cache schema locally (removes this warning)`,
        vscode.CodeActionKind.QuickFix,
      );
      cacheAction.command = {
        command: 'jsonschema.cacheSchemaLocally',
        title: 'Cache Schema Locally',
        arguments: [url, document.uri],
      };
      if (schemaLoadDiags.length > 0) cacheAction.diagnostics = schemaLoadDiags;
      actions.push(cacheAction);
    }

    return actions;
  }
}

// ── Shared URL extraction ──────────────────────────────────────────────────────

/** Extract the schema URL from line `lineIndex` of `document`, or undefined. */
export function extractSchemaUrlFromLine(
  document: vscode.TextDocument,
  lineIndex: number,
): string | undefined {
  const line = document.lineAt(lineIndex).text;

  // JSON/JSONC: `"$schema": "https://..."` (anywhere on the line)
  const jsonMatch = /"\$schema"\s*:\s*"(https?:\/\/[^"]+)"/.exec(line);
  if (jsonMatch) return jsonMatch[1];

  // YAML comment directive: `# yaml-language-server: $schema=https://...`
  const directiveMatch = /yaml-language-server[^$]*\$schema=(https?:\/\/\S+)/i.exec(line);
  if (directiveMatch) return directiveMatch[1];

  // YAML inline: `$schema: https://...`
  const yamlMatch = /^\s*\$schema:\s*(https?:\/\/\S+)/.exec(line);
  if (yamlMatch) return yamlMatch[1];

  return undefined;
}
