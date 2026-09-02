// F03 — the validate-file command: schema resolution (binding → inline
// $schema → native match), remote fetch with stale-cache fallback, Ajv
// validation, and diagnostics. Unit-tested via the shared vscode mock; the
// pure parsing/locating core is shared with F20 in workspaceValidation.ts.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findBoundSchemaPath, extractInlineSchemaUrl, normalise } from './SchemaBindingManager';
import type { NativeSchemaMatch } from './nativeSchema';
import { isSupported, languageForSchemaSource } from './languages';
import { parseSchemaText } from './schemaPointer';
import { parseDataText, locateInstanceSpan } from './workspaceValidation';
import { SchemaAuthManager, AuthRequiredError } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { getRemoteFetchTimeoutMs } from './settings';
import { classifyFetchFailure, shouldFallbackToCache } from './reliability';
import { createAjv } from './ajvFactory';
import { buildFixes } from './validationFix';
import type { ValidationFixProvider } from './ValidationFixProvider';

export const validationDiagnostics =
  vscode.languages.createDiagnosticCollection('json-schema-validation');

/** Detects a schema VS Code resolves natively for a document (F04-FR-15), so the
 *  validator can fall back to it — supplied by the binding manager. */
export type DetectNativeSchema = (doc: vscode.TextDocument) => NativeSchemaMatch | undefined;

/** Options for a non-interactive run (F03-FR-17). */
export interface ValidateOptions {
  /** Diagnostics only: no notifications, and no network for an uncached schema. */
  silent?: boolean;
  /** Validate this document instead of the active editor's. */
  document?: vscode.TextDocument;
}

export function validateCurrentFile(
  auth: SchemaAuthManager,
  cache?: SchemaCache,
  fixes?: ValidationFixProvider,
  detectNative?: DetectNativeSchema,
  opts?: ValidateOptions,
) {
  const silent = opts?.silent === true;
  /** Suppressed entirely on an automatic run — a save must stay quiet. */
  const notify = <T>(show: () => Thenable<T> | T): Thenable<T> | T | undefined =>
    (silent ? undefined : show());

  return async () => {
    const doc = opts?.document ?? vscode.window.activeTextEditor?.document;
    if (!doc) {
      notify(() => vscode.window.showInformationMessage('Open a JSON or YAML file to validate.'));
      return;
    }

    if (!isSupported(doc.languageId)) {
      notify(() => vscode.window.showInformationMessage('Validation supports JSON, JSONC, JSONL, YAML, and TOML files.'));
      return;
    }

    // External binding takes precedence; fall back to the file's own $schema
    // field, then to a schema VS Code resolves natively for this file
    // (F03-FR-16 / F04-FR-15) — an auto-bound file is schema-backed, so
    // validation must use that schema rather than report "no schema bound".
    const schemaPath =
      findBoundSchemaPath(doc) ??
      extractInlineSchemaUrl(doc) ??
      detectNative?.(doc)?.url;
    if (!schemaPath) {
      if (silent) { return; }
      const action = await vscode.window.showWarningMessage(
        `No schema bound to ${path.basename(doc.uri.fsPath)}. Bind one first.`,
        'Bind Schema'
      );
      if (action === 'Bind Schema') {
        vscode.commands.executeCommand('jsonschema.bindToCurrentFile');
      }
      return;
    }

    // F03-FR-17 — an automatic run never reaches the network: an uncached
    // remote schema simply means nothing to validate against this time.
    if (silent && SchemaAuthManager.isRemoteUrl(schemaPath) && cache?.readCached(schemaPath) === undefined) {
      return;
    }

    let schema: unknown;
    try {
      const loaded = await loadSchema(schemaPath, auth, doc, cache);
      schema = loaded.schema;
      if (loaded.stale && !silent) {
        // S04-SR-02: announce the fallback without blocking validation.
        vscode.window.showWarningMessage(
          `${SchemaAuthManager.hostOf(schemaPath)} is unreachable — validating against the last cached copy of the schema.`,
        );
      }
    } catch (e) {
      if (silent) { return; }
      if (e instanceof AuthRequiredError) {
        const action = await vscode.window.showErrorMessage(
          `Schema at ${SchemaAuthManager.hostOf(e.url)} requires authentication (HTTP ${e.status}).`,
          'Configure Auth'
        );
        if (action === 'Configure Auth') {
          vscode.commands.executeCommand('jsonschema.configureSchemaAuth', e.url);
        }
        return;
      }
      vscode.window.showErrorMessage(
        `Cannot load schema "${path.basename(schemaPath)}": ${(e as Error).message}`
      );
      return;
    }

    let items: unknown[];
    try {
      items = parseDataText(doc.getText(), doc.languageId);
    } catch (e) {
      notify(() => vscode.window.showErrorMessage(
        `Cannot parse ${path.basename(doc.uri.fsPath)}: ${(e as Error).message}`
      ));
      return;
    }

    // F03-FR-15: pick the AJV dialect matching the schema's declared $schema
    // so newer-draft keywords are enforced, not silently ignored.
    const ajv = createAjv(schema, { allErrors: true, strict: false });
    let validate: ReturnType<typeof ajv.compile>;
    try {
      validate = ajv.compile(schema as object);
    } catch (e) {
      notify(() => vscode.window.showErrorMessage(`Cannot compile schema: ${(e as Error).message}`));
      return;
    }

    validationDiagnostics.delete(doc.uri);
    const diags: vscode.Diagnostic[] = [];
    // F21: collect quick fixes for the single-item JSON/JSONC case only, where a
    // data pointer maps unambiguously to one node and `modify` can edit it.
    const fixable = items.length === 1 && (doc.languageId === 'json' || doc.languageId === 'jsonc');
    let collectedFixes: ReturnType<typeof buildFixes> = [];

    for (const data of items) {
      if (!validate(data)) {
        const errors = validate.errors ?? [];
        if (fixable) { collectedFixes = buildFixes(errors, schema, data); }
        for (const err of errors) {
          const range = locateInDocument(doc, err.instancePath ?? '');
          const label = err.instancePath || '(root)';
          const diagnostic = new vscode.Diagnostic(
            range,
            `${label}: ${err.message ?? 'validation error'}`,
            vscode.DiagnosticSeverity.Error
          );
          // F03-FR-08: tag the source so these diagnostics are distinguishable
          // in the Problems panel from VS Code's built-in JSON/YAML
          // language-server validation.
          diagnostic.source = 'JSON Schema';
          // F21-FR-08: carry the error's instance path so the quick-fix provider
          // can match a fix to the diagnostics present at the cursor (`/` = root).
          diagnostic.code = err.instancePath || '/';
          diags.push(diagnostic);
        }
      }
    }

    if (diags.length === 0) {
      fixes?.record(doc.uri, []); // F21-FR-09: clear stale fixes on a clean run
      notify(() => vscode.window.showInformationMessage(
        `✓ ${path.basename(doc.uri.fsPath)} is valid against ${path.basename(schemaPath)}.`
      ));
      return;
    }

    fixes?.record(doc.uri, collectedFixes);

    validationDiagnostics.set(doc.uri, diags);
    notify(() => vscode.window.showErrorMessage(
      `✗ ${diags.length} validation error${diags.length === 1 ? '' : 's'} in ` +
      `${path.basename(doc.uri.fsPath)}. See Problems panel.`
    ));
  };
}

interface LoadedSchema { schema: unknown; stale: boolean; }

/** Load and parse a schema, fetching with auth headers when it is a remote URL. */
async function loadSchema(
  schemaPath: string,
  auth: SchemaAuthManager,
  doc: vscode.TextDocument,
  cache?: SchemaCache,
): Promise<LoadedSchema> {
  if (SchemaAuthManager.isRemoteUrl(schemaPath)) {
    try {
      return { schema: parseSchema(await auth.fetchText(schemaPath, getRemoteFetchTimeoutMs()), schemaPath), stale: false };
    } catch (e) {
      // S04-SR-01/04: on a transient failure (5xx or network-level), fall back
      // to the last cached copy if one exists. Auth (401/403) and other 4xx
      // re-throw so the caller can prompt for auth / surface the error.
      if (shouldFallbackToCache(classifyFetchFailure(e)) && cache) {
        const cached = cache.readCached(schemaPath);
        if (cached !== undefined) {
          // F03-FR-14/F13-FR-06: parse the cached copy by the ORIGINAL URL's
          // format — the cache file is always named .json regardless of source.
          return { schema: parseSchema(cached, schemaPath), stale: true };
        }
      }
      throw e;
    }
  }
  // file:// URIs are written by redirectBindingToLocalCache; convert to a plain fs path.
  let resolved = schemaPath.startsWith('file://')
    ? vscode.Uri.parse(schemaPath).fsPath
    : schemaPath;
  if (!path.isAbsolute(resolved)) {
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (folder) { resolved = path.join(folder.uri.fsPath, normalise(resolved)); }
  }
  return { schema: parseSchema(fs.readFileSync(resolved, 'utf-8'), resolved), stale: false };
}

/**
 * Parses a schema document by its own source format (F03-FR-14): YAML when the
 * source path/URL ends in `.yaml`/`.yml`, otherwise JSON/JSONC. Throws a
 * descriptive error when the text does not parse, so `loadSchema`'s caller can
 * surface the cause (F03-FR-11) instead of receiving a silent `undefined`.
 */
function parseSchema(text: string, source: string): unknown {
  const languageId = languageForSchemaSource(source);
  const parsed = parseSchemaText(text, languageId);
  if (parsed === undefined) {
    throw new Error(`schema is not valid ${languageId === 'yaml' ? 'YAML' : 'JSON'}`);
  }
  return parsed;
}

/** Range of an Ajv instance path via the shared F03/F20 locator (AST-exact
 *  for JSON/JSONC/YAML, text-scan fallback); document start when unlocatable. */
function locateInDocument(doc: vscode.TextDocument, instancePath: string): vscode.Range {
  const span = locateInstanceSpan(doc.getText(), doc.languageId, instancePath);
  if (!span) { return new vscode.Range(0, 0, 0, 0); }
  return new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end));
}
