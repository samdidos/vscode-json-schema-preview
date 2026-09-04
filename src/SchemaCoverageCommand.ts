// F23 — the schema-coverage command. Resolves the active data file's schema
// (inline $schema or a settings binding), runs the pure coverage analyser, and
// highlights every unexercised schema property as an Information diagnostic
// (tagged Unnecessary) on the schema file, plus a summary with a Copy-report
// action. All non-trivial logic lives in the pure `schemaCoverage` module; this
// file is the thin VS Code wiring.
import * as vscode from 'vscode';
import { confirm } from './notify';
import * as fs from 'fs';
import * as path from 'path';
import {
  reconcile, renderReconcileReport,
  type SchemaProperty, type UndeclaredProperty,
} from './schemaCoverage';
import { parseSchemaText, parseJsonPointer, locatePointerTarget } from './schemaPointer';
import { findBoundSchemaPath, extractInlineSchemaUrl } from './SchemaBindingManager';
import { SchemaAuthManager } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { isSupported, languageForSchemaSource } from './languages';
import { parseDataText } from './workspaceValidation';

/** Register the coverage command and its dedicated diagnostic collection. */
export function registerSchemaCoverage(context: vscode.ExtensionContext, schemaCache: SchemaCache): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('jsonschema-coverage');
  context.subscriptions.push(
    diagnostics,
    vscode.commands.registerCommand('jsonschema.schemaCoverage', () => runCoverage(schemaCache, diagnostics)),
  );
}

async function runCoverage(
  schemaCache: SchemaCache,
  diagnostics: vscode.DiagnosticCollection,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSupported(editor.document.languageId)) {
    vscode.window.showInformationMessage('Open a JSON, YAML, or TOML data file to measure schema coverage.');
    return;
  }
  const doc = editor.document;

  const ref = extractInlineSchemaUrl(doc) ?? findBoundSchemaPath(doc);
  if (!ref) {
    vscode.window.showInformationMessage(
      'No schema is bound to this file. Add a $schema reference or bind one, then try again.',
    );
    return;
  }

  const resolved = await resolveSchema(ref, doc, schemaCache);
  if (!resolved) { return; }

  const schema = parseSchemaText(resolved.text, resolved.languageId);
  if (schema === undefined) {
    vscode.window.showErrorMessage('Cannot parse the bound schema.');
    return;
  }

  const instances = parseInstances(doc);
  // Both directions in one pass (F23-FR-09): what the data never exercises,
  // and what it uses that the schema does not declare.
  const { coverage: result, undeclared } = reconcile(schema, instances);

  // Highlight unexercised properties on the schema file (F23-FR-07). Remote
  // schemas have no local file to annotate — they get the summary/report only.
  diagnostics.clear();
  if (resolved.uri && result.unexercised.length) {
    const diags = buildDiagnostics(resolved.text, resolved.languageId, result.unexercised);
    if (diags.length) { diagnostics.set(resolved.uri, diags); }
  }

  const undeclaredPaths: UndeclaredProperty[] = undeclared;
  const drift = undeclaredPaths.length
    ? ` ${undeclared.length} path${undeclared.length === 1 ? '' : 's'} in the data are undeclared.`
    : '';
  const summary =
    `Schema coverage: ${result.exercised.length}/${result.total} properties exercised (${result.percent}%). ` +
    `${result.unexercised.length} unexercised.` + drift;
  const action = await vscode.window.showInformationMessage(summary, 'Copy report');
  if (action === 'Copy report') {
    const header = `${path.basename(doc.uri.fsPath)} vs ${schemaLabel(ref)}`;
    await vscode.env.clipboard.writeText(renderReconcileReport({ coverage: result, undeclared }, header));
    confirm('Coverage report copied to the clipboard.');
  }
}

interface ResolvedSchema {
  text: string;
  languageId: string;
  /** The schema's own file URI when it is local (so diagnostics can land on it). */
  uri?: vscode.Uri;
}

/**
 * Load the schema text for `ref` (F23-FR-02): a cached remote URL, or a local
 * file resolved relative to the data document. An uncached remote schema offers
 * to cache it and returns undefined (nothing to measure yet).
 */
async function resolveSchema(
  ref: string,
  doc: vscode.TextDocument,
  schemaCache: SchemaCache,
): Promise<ResolvedSchema | undefined> {
  if (SchemaAuthManager.isRemoteUrl(ref)) {
    const cached = schemaCache.readCached(ref);
    if (cached === undefined) {
      const pick = await vscode.window.showInformationMessage(
        'The bound schema is remote and not cached locally. Cache it first to measure coverage.',
        'Cache Schema Locally',
      );
      if (pick === 'Cache Schema Locally') {
        await vscode.commands.executeCommand('jsonschema.cacheSchemaLocally', ref);
      }
      return undefined;
    }
    return { text: cached, languageId: languageForSchemaSource(ref) };
  }

  const absPath = path.isAbsolute(ref) ? ref : path.resolve(path.dirname(doc.uri.fsPath), ref);
  let text: string;
  try {
    text = fs.readFileSync(absPath, 'utf-8');
  } catch {
    vscode.window.showErrorMessage(`Cannot read the bound schema: ${ref}`);
    return undefined;
  }
  return { text, languageId: languageForSchemaSource(absPath), uri: vscode.Uri.file(absPath) };
}

/** Parse the data document into instances via the shared F03/F20 dispatch —
 *  one per JSONL record, else one; empty on unparsable input (nothing to
 *  measure, rather than an error). */
function parseInstances(doc: vscode.TextDocument): unknown[] {
  try {
    return parseDataText(doc.getText(), doc.languageId);
  } catch {
    return [];
  }
}

/** Build Information/Unnecessary diagnostics on each unexercised property's span. */
function buildDiagnostics(
  schemaText: string,
  languageId: string,
  unexercised: SchemaProperty[],
): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  for (const prop of unexercised) {
    const span = locatePointerTarget(schemaText, languageId, parseJsonPointer(prop.schemaPointer));
    if (!span) { continue; }
    const range = new vscode.Range(
      offsetToPosition(schemaText, span.start),
      offsetToPosition(schemaText, span.end),
    );
    const diag = new vscode.Diagnostic(
      range,
      `Property "${prop.dataPath}" is declared by the schema but never set in the data.`,
      vscode.DiagnosticSeverity.Information,
    );
    diag.source = 'json-schema-preview';
    diag.tags = [vscode.DiagnosticTag.Unnecessary];
    diags.push(diag);
  }
  return diags;
}

/** Convert a 0-based character offset into a {@link vscode.Position}. */
function offsetToPosition(text: string, offset: number): vscode.Position {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') { line++; lineStart = i + 1; }
  }
  return new vscode.Position(line, offset - lineStart);
}

function schemaLabel(ref: string): string {
  return SchemaAuthManager.isRemoteUrl(ref) ? SchemaAuthManager.hostOf(ref) : path.basename(ref);
}
