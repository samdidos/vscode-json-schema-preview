// F20 — the Validate Workspace command. Thin VS Code glue over the pure
// workspaceValidation module: discovery via findFiles (which honours
// files.exclude / search.exclude), a bounded worker pool with per-file
// failure isolation, a dedicated DiagnosticCollection, cancellable progress,
// and the summary notification with its "Copy Report" action.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  MAX_FILE_BYTES,
  languageIdForPath,
  isMetaSchemaRef,
  parseDataText,
  validateInstances,
  lineOfMatch,
  lineAt,
  summarize,
  summaryLine,
  renderMarkdownReport,
  type FileResult,
  type ValidationIssue,
  type RunMeta,
} from './workspaceValidation';
import { findBoundSchemaPath, extractInlineSchemaUrl, normalise } from './SchemaBindingManager';
import { lintSchema } from './schemaLinter';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { parseTestSuite, runTestSuite, isSuitePath } from './schemaTests';
import { positionAt } from './SchemaRefProvider';
import { parseSchemaText, locatePointerTarget, parseJsonPointer } from './schemaPointer';
import { languageForSchemaSource, isSupported } from './languages';
import { SchemaAuthManager } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { getLintRuleSeverities, getRemoteFetchTimeoutMs, getWorkspaceValidationMaxFiles } from './settings';

const SOURCE = 'json-schema-workspace';
const CONCURRENCY = 4;
const FILE_GLOB = '**/*.{json,jsonc,jsonl,yaml,yml,toml}';

type LoadOutcome = { schema: unknown } | { error: string };

export function registerWorkspaceValidation(
  context: vscode.ExtensionContext,
  auth: SchemaAuthManager,
  cache: SchemaCache,
): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(SOURCE);
  context.subscriptions.push(
    diagnostics,
    vscode.commands.registerCommand('jsonschema.validateWorkspace', () =>
      validateWorkspace(diagnostics, auth, cache)),
  );
}

async function validateWorkspace(
  diagnostics: vscode.DiagnosticCollection,
  auth: SchemaAuthManager,
  cache: SchemaCache,
): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    vscode.window.showInformationMessage('Open a workspace folder to validate it.');
    return;
  }

  const untrusted = !vscode.workspace.isTrusted;
  const maxFiles = getWorkspaceValidationMaxFiles();
  // findFiles applies the files.exclude + search.exclude defaults when the
  // exclude argument is undefined (F20-FR-03).
  const uris = await vscode.workspace.findFiles(FILE_GLOB, undefined, maxFiles + 1);
  const truncated = uris.length > maxFiles;
  const files = truncated ? uris.slice(0, maxFiles) : uris;

  // F20-FR-08: a new run replaces the previous run's diagnostics entirely.
  diagnostics.clear();

  const run = new WorkspaceRun(diagnostics, auth, cache, untrusted);
  let cancelled = false;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Validating workspace…',
      cancellable: true,
    },
    async (progress, token) => {
      let done = 0;
      let next = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          if (token.isCancellationRequested) { cancelled = true; return; }
          const index = next++;
          if (index >= files.length) { return; }
          // F20-FR-04: failures are isolated per file — never abort the run.
          try {
            await run.processFile(files[index]);
          } catch (e) {
            run.results.push({
              relPath: vscode.workspace.asRelativePath(files[index], false),
              folder: vscode.workspace.getWorkspaceFolder(files[index])?.name ?? '',
              kind: 'data',
              status: 'binding-failed',
              issues: [{ message: `Could not process file: ${(e as Error).message}` }],
            });
          }
          done++;
          progress.report({
            message: `${done}/${files.length} files`,
            increment: 100 / Math.max(files.length, 1),
          });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    },
  );

  const meta: RunMeta = { truncated, maxFiles, untrusted, skippedLarge: run.skippedLarge };
  const summary = summarize(run.results);
  const line = cancelled
    ? `Workspace validation cancelled after ${run.results.length} file(s). Published results are kept.`
    : summaryLine(summary, meta);
  const action = await vscode.window.showInformationMessage(line, 'Copy Report');
  if (action === 'Copy Report') {
    // F20-FR-07: Markdown report suitable for pasting into a PR comment.
    await vscode.env.clipboard.writeText(renderMarkdownReport(run.results, meta));
  }
}

/** State and per-file logic for one validation run. */
class WorkspaceRun {
  readonly results: FileResult[] = [];
  skippedLarge = 0;

  /** Loaded schemas memoized by resolved reference, so N files bound to one
   *  schema cost at most one read/fetch per run (F20-NFR-02). */
  private readonly schemaLoads = new Map<string, Promise<LoadOutcome>>();

  constructor(
    private readonly diagnostics: vscode.DiagnosticCollection,
    private readonly auth: SchemaAuthManager,
    private readonly cache: SchemaCache,
    private readonly untrusted: boolean,
  ) {}

  /**
   * F20-FR-09 — run one `*.schema.test.json` suite, reporting failing cases as
   * diagnostics on the suite file and as a result row. Never throws: a
   * malformed suite or an unloadable schema is a binding failure like any other.
   */
  private async runSuite(
    uri: vscode.Uri,
    text: string,
    languageId: string,
    relPath: string,
    folder: string,
  ): Promise<void> {
    const fail = (message: string): void => {
      this.results.push({ relPath, folder, kind: 'suite', status: 'binding-failed', issues: [{ message }] });
      this.diagnostics.set(uri, [
        new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message, vscode.DiagnosticSeverity.Warning),
      ]);
    };

    let raw: unknown;
    try {
      raw = parseDataText(text, languageId)[0];
    } catch (e) {
      fail(`Cannot parse suite: ${(e as Error).message}`);
      return;
    }
    const parsed = parseTestSuite(raw);
    if (!parsed.ok) {
      fail(`Malformed suite: ${parsed.problems.map(p => p.message).join(' ')}`);
      return;
    }

    const ref = parsed.suite.schemaRef;
    const loaded = await this.loadSchema(ref, uri);
    if ('error' in loaded) {
      fail(`Cannot load schema "${ref}": ${loaded.error}`);
      return;
    }

    const suiteDir = path.dirname(uri.fsPath);
    const result = runTestSuite(parsed.suite, loaded.schema, {
      loadInstance: (relative: string) => {
        const abs = path.resolve(suiteDir, relative);
        return parseDataText(fs.readFileSync(abs, 'utf-8'), languageIdForPath(abs) ?? 'json')[0];
      },
    });

    const failures = result.cases.filter(c => !c.passed);
    const diags = failures.map(c => {
      const span = locatePointerTarget(text, 'json', parseJsonPointer(c.pointer));
      const range = span
        ? new vscode.Range(positionAt(text, span.start), positionAt(text, span.end))
        : new vscode.Range(0, 0, 0, 1);
      const diagnostic = new vscode.Diagnostic(range, `${c.name}: ${c.message ?? 'failed'}`, vscode.DiagnosticSeverity.Error);
      diagnostic.source = SOURCE;
      return diagnostic;
    });
    if (diags.length) { this.diagnostics.set(uri, diags); }

    this.results.push({
      relPath, folder, kind: 'suite',
      status: failures.length ? 'errors' : 'valid',
      schemaRef: ref,
      issues: failures.map(c => ({ message: `${c.name}: ${c.message ?? 'failed'}` })),
    });
  }

  async processFile(uri: vscode.Uri): Promise<void> {
    const languageId = languageIdForPath(uri.fsPath);
    if (!languageId || !isSupported(languageId)) { return; }

    // Read once and check the actual bytes read, rather than stat() then a
    // separate readFile() — two calls race (the file can change in between);
    // one read has nothing to race against.
    const buffer = await fs.promises.readFile(uri.fsPath);
    if (buffer.length > MAX_FILE_BYTES) { this.skippedLarge++; return; }
    const text = buffer.toString('utf-8');

    // A light TextDocument stand-in: binding lookup and inline extraction
    // only touch uri, languageId, and getText (F20-FR-02, unopened files).
    const lightDoc = { uri, languageId, getText: () => text } as vscode.TextDocument;

    const relPath = vscode.workspace.asRelativePath(uri, false);
    const folder = vscode.workspace.getWorkspaceFolder(uri)?.name ?? '';
    const fileDiags: vscode.Diagnostic[] = [];

    // (d) Schema test suites: the third checked artifact (F20-FR-09). A suite
    // is neither a schema nor a bound data file, so it short-circuits here.
    if (isSuitePath(uri.fsPath)) {
      await this.runSuite(uri, text, languageId, relPath, folder);
      return;
    }

    // (c) Schema files: F17's lintable set (F20-FR-02/04).
    const isSchemaFile = /\.schema\.(json|jsonc|ya?ml)$/i.test(uri.fsPath) || isJsonSchemaFile(lightDoc);
    if (isSchemaFile) {
      this.lintSchemaFile(text, languageId, relPath, folder, fileDiags);
    }

    // (a)+(b) Data files: settings binding first, else a non-meta inline
    // $schema (F20-FR-02).
    const settingsRef = findBoundSchemaPath(lightDoc);
    const inlineRef = settingsRef ? undefined : extractInlineSchemaUrl(lightDoc);
    const schemaRef = settingsRef ?? (inlineRef && !isMetaSchemaRef(inlineRef) ? inlineRef : undefined);
    if (schemaRef) {
      await this.validateDataFile(uri, text, languageId, schemaRef, settingsRef !== undefined, relPath, folder, fileDiags);
    }

    if (fileDiags.length) { this.diagnostics.set(uri, fileDiags); }
  }

  private lintSchemaFile(
    text: string,
    languageId: string,
    relPath: string,
    folder: string,
    fileDiags: vscode.Diagnostic[],
  ): void {
    const overrides = getLintRuleSeverities();
    const issues: ValidationIssue[] = [];
    for (const finding of lintSchema(text, languageId)) {
      const override = overrides[finding.ruleId];
      const severity = override === 'off' || override === 'hint' || override === 'info' || override === 'warning'
        ? override
        : finding.defaultSeverity;
      if (severity === 'off') { continue; }
      const start = positionAt(text, finding.offset);
      const end = positionAt(text, finding.offset + finding.length);
      const diag = new vscode.Diagnostic(
        new vscode.Range(start, end),
        finding.message,
        severity === 'warning' ? vscode.DiagnosticSeverity.Warning
          : severity === 'info' ? vscode.DiagnosticSeverity.Information
          : vscode.DiagnosticSeverity.Hint,
      );
      diag.source = SOURCE;
      diag.code = finding.ruleId;
      fileDiags.push(diag);
      issues.push({ message: `${finding.ruleId}: ${finding.message}`, line: start.line });
    }
    this.results.push({
      relPath, folder, kind: 'schema',
      status: issues.length ? 'lint-findings' : 'clean-schema',
      issues,
    });
  }

  private async validateDataFile(
    uri: vscode.Uri,
    text: string,
    languageId: string,
    schemaRef: string,
    fromSettings: boolean,
    relPath: string,
    folder: string,
    fileDiags: vscode.Diagnostic[],
  ): Promise<void> {
    const outcome = await this.loadSchema(schemaRef, uri);
    if ('error' in outcome) {
      // F20-FR-05: point the diagnostic at the binding itself.
      const message = `Cannot load schema "${schemaRef}": ${outcome.error}`;
      this.publishBindingFailure(uri, text, fromSettings, schemaRef, message, fileDiags);
      this.results.push({ relPath, folder, kind: 'data', status: 'binding-failed', schemaRef, issues: [{ message }] });
      return;
    }

    let issues: ValidationIssue[];
    try {
      issues = validateInstances(parseDataText(text, languageId), outcome.schema, text, languageId);
    } catch (e) {
      issues = [{ message: `Cannot ${languageId === 'json' || languageId === 'jsonc' ? 'parse or validate' : 'parse'} file: ${(e as Error).message}`, line: 0 }];
    }
    for (const issue of issues) {
      const line = issue.line ?? 0;
      const diag = new vscode.Diagnostic(
        new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
        issue.message,
        vscode.DiagnosticSeverity.Error,
      );
      diag.source = SOURCE;
      fileDiags.push(diag);
    }
    this.results.push({
      relPath, folder, kind: 'data',
      status: issues.length ? 'errors' : 'valid',
      schemaRef, issues,
    });
  }

  /** Diagnostic on the binding (F20-FR-05): the inline `$schema` line, or the
   *  folder settings-file line naming the schema — best-effort, falling back
   *  to the top of the data file. */
  private publishBindingFailure(
    uri: vscode.Uri,
    text: string,
    fromSettings: boolean,
    schemaRef: string,
    message: string,
    fileDiags: vscode.Diagnostic[],
  ): void {
    if (fromSettings) {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      const settingsPath = folder ? path.join(folder.uri.fsPath, '.vscode', 'settings.json') : undefined;
      try {
        const settingsText = fs.readFileSync(settingsPath!, 'utf-8');
        // Plain literal search — schemaRef comes from workspace settings, so
        // it must never be used to build a RegExp (see workspaceValidation.ts's
        // locateKeyLine for why a hand-escaped string isn't a safe substitute).
        const idx = settingsText.indexOf(schemaRef);
        const line = idx === -1 ? undefined : lineAt(settingsText, idx);
        if (line !== undefined) {
          const diag = new vscode.Diagnostic(
            new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER), message, vscode.DiagnosticSeverity.Error,
          );
          diag.source = SOURCE;
          this.diagnostics.set(vscode.Uri.file(settingsPath!), [diag]);
          return;
        }
      } catch { /* no readable settings file — fall through to the data file */ }
    }
    const inlineLine = lineOfMatch(text, /"?\$schema"?\s*[:=]/) ?? 0;
    const line = fromSettings ? 0 : inlineLine;
    const diag = new vscode.Diagnostic(
      new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER), message, vscode.DiagnosticSeverity.Error,
    );
    diag.source = SOURCE;
    fileDiags.push(diag);
  }

  /** Load a schema by reference, memoized per resolved id. Remote schemas are
   *  cache-first (F20-NFR-02); in an untrusted workspace they are cache-ONLY
   *  (F20-NFR-03). Local paths resolve against the file's workspace folder. */
  private loadSchema(schemaRef: string, dataUri: vscode.Uri): Promise<LoadOutcome> {
    const resolved = this.resolveRef(schemaRef, dataUri);
    let pending = this.schemaLoads.get(resolved);
    if (!pending) {
      pending = this.loadResolved(resolved);
      this.schemaLoads.set(resolved, pending);
    }
    return pending;
  }

  private resolveRef(schemaRef: string, dataUri: vscode.Uri): string {
    if (SchemaAuthManager.isRemoteUrl(schemaRef)) { return schemaRef; }
    let fsPath = schemaRef.startsWith('file://') ? vscode.Uri.parse(schemaRef).fsPath : schemaRef;
    if (!path.isAbsolute(fsPath)) {
      const folder = vscode.workspace.getWorkspaceFolder(dataUri);
      const base = folder?.uri.fsPath ?? path.dirname(dataUri.fsPath);
      fsPath = path.join(base, normalise(fsPath));
    }
    return fsPath;
  }

  private async loadResolved(resolved: string): Promise<LoadOutcome> {
    try {
      let text: string;
      if (SchemaAuthManager.isRemoteUrl(resolved)) {
        const cached = this.cache.readCached(resolved);
        if (cached !== undefined) {
          text = cached;
        } else if (this.untrusted) {
          return { error: 'remote schema is not cached and the workspace is untrusted (no network access)' };
        } else {
          text = await this.auth.fetchText(resolved, getRemoteFetchTimeoutMs());
        }
      } else {
        text = await fs.promises.readFile(resolved, 'utf-8');
      }
      const schema = parseSchemaText(text, languageForSchemaSource(resolved));
      if (schema === undefined) { return { error: 'schema does not parse' }; }
      return { schema };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}
