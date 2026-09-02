// F29 — the editor surface for schema test suites: run the active suite (or
// every suite guarding the active schema) and surface failures as diagnostics
// positioned on the case that failed.
//
// Suite parsing and running live in `schemaTests`; this file resolves files and
// renders results.

import * as vscode from 'vscode';
import * as path from 'path';
import { readFileSync } from 'fs';
import {
  parseTestSuite, runTestSuite, isSuitePath, renderSuiteReport,
  type SuiteResult, type TestSuite, type CaseResult,
} from './schemaTests';
import { parseDataText, languageIdForPath } from './workspaceValidation';
import { parseSchemaText, locatePointerTarget, parseJsonPointer } from './schemaPointer';
import { languageForSchemaSource } from './languages';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { resolveWithin, outsideRootMessage } from './pathSafety';

export const RUN_TESTS_COMMAND = 'jsonschema.runSchemaTests';

/** Workspace folder containing `uri` — the root a suite's paths may not leave. */
function rootFor(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

/** One resolved, runnable suite. */
interface LoadedSuite {
  uri: vscode.Uri;
  suite: TestSuite;
  schema: unknown;
}

async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf-8');
}

async function readParsed(uri: vscode.Uri): Promise<unknown> {
  const text = await readText(uri);
  return parseDataText(text, languageIdForPath(uri.fsPath) ?? 'json')[0];
}

/**
 * Load a suite and the schema it declares. Remote schemas are resolved through
 * the workspace only — the runner itself never fetches (F29-NFR-02).
 */
async function loadSuite(uri: vscode.Uri): Promise<LoadedSuite | { error: string }> {
  let raw: unknown;
  try {
    raw = await readParsed(uri);
  } catch (e) {
    return { error: `Cannot read ${path.basename(uri.fsPath)}: ${(e as Error).message}` };
  }
  const parsed = parseTestSuite(raw);
  if (!parsed.ok) {
    return { error: `${path.basename(uri.fsPath)}: ${parsed.problems.map(p => p.message).join(' ')}` };
  }
  const ref = parsed.suite.schemaRef;
  if (/^https?:\/\//.test(ref)) {
    return { error: `${path.basename(uri.fsPath)}: remote schema "${ref}" — cache it locally first.` };
  }
  // F29-FR-14 — the ref comes from the suite's own contents, so it is confined
  // to the workspace rather than resolved wherever it points.
  const root = rootFor(uri);
  const schemaPath = root && resolveWithin(root, path.dirname(uri.fsPath), ref);
  if (!schemaPath) {
    return { error: `${path.basename(uri.fsPath)}: ${outsideRootMessage(ref)}` };
  }
  const schemaUri = vscode.Uri.file(schemaPath);
  try {
    const schema = parseSchemaText(await readText(schemaUri), languageForSchemaSource(schemaUri.fsPath));
    if (schema === undefined) { throw new Error('the schema does not parse'); }
    return { uri, suite: parsed.suite, schema };
  } catch (e) {
    return { error: `${path.basename(uri.fsPath)}: cannot load "${ref}" — ${(e as Error).message}` };
  }
}

/** Suites in the workspace whose declared schema resolves to `schemaUri`. */
async function suitesFor(schemaUri: vscode.Uri): Promise<vscode.Uri[]> {
  const candidates = await vscode.workspace.findFiles('**/*.schema.test.json', '**/node_modules/**', 200);
  const matches: vscode.Uri[] = [];
  for (const candidate of candidates) {
    const loaded = await loadSuite(candidate);
    if ('error' in loaded) { continue; }
    const resolved = path.resolve(path.dirname(candidate.fsPath), loaded.suite.schemaRef);
    if (resolved === schemaUri.fsPath) { matches.push(candidate); }
  }
  return matches;
}

/** Failing cases as diagnostics on the suite document (F29-FR-11). */
export function suiteDiagnostics(suiteText: string, result: SuiteResult): vscode.Diagnostic[] {
  return result.cases
    .filter(c => !c.passed)
    .map((c: CaseResult) => {
      const span = locatePointerTarget(suiteText, 'json', parseJsonPointer(c.pointer));
      const range = span
        ? new vscode.Range(offsetToPosition(suiteText, span.start), offsetToPosition(suiteText, span.end))
        : new vscode.Range(0, 0, 0, 1);
      const diagnostic = new vscode.Diagnostic(
        range,
        `${c.name}: ${c.message ?? 'failed'}`,
        vscode.DiagnosticSeverity.Error,
      );
      diagnostic.source = 'jsonschema';
      diagnostic.code = 'schema-test';
      return diagnostic;
    });
}

function offsetToPosition(text: string, offset: number): vscode.Position {
  const before = text.slice(0, offset);
  const line = (before.match(/\n/g) ?? []).length;
  return new vscode.Position(line, offset - (before.lastIndexOf('\n') + 1));
}

export function registerSchemaTests(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('jsonschema-tests');
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand(RUN_TESTS_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a schema or a *.schema.test.json suite to run tests.');
        return;
      }

      // A suite file runs itself; a schema file runs every suite guarding it.
      const targets = isSuitePath(editor.document.uri.fsPath)
        ? [editor.document.uri]
        : isJsonSchemaFile(editor.document)
          ? await suitesFor(editor.document.uri)
          : [];

      if (!targets.length) {
        vscode.window.showInformationMessage(
          'No schema test suite found. Create a *.schema.test.json file next to the schema.',
        );
        return;
      }

      // F29-FR-11 — each run replaces the previous run's diagnostics.
      diagnostics.clear();
      let total = 0;
      let failed = 0;
      const reports: string[] = [];
      const problems: string[] = [];

      for (const uri of targets) {
        const loaded = await loadSuite(uri);
        if ('error' in loaded) { problems.push(loaded.error); continue; }

        const suiteDir = path.dirname(uri.fsPath);
        const suiteRoot = rootFor(uri);
        const result = runTestSuite(loaded.suite, loaded.schema, {
          // F29-FR-14 — a case's `file` is document content; a fixture outside
          // the workspace fails that case rather than being read.
          loadInstance: (relPath: string) => {
            const abs = suiteRoot && resolveWithin(suiteRoot, suiteDir, relPath);
            if (!abs) { throw new Error(outsideRootMessage(relPath)); }
            const text = readFileSync(abs, 'utf-8');
            return parseDataText(text, languageIdForPath(abs) ?? 'json')[0];
          },
        });
        total += result.total;
        failed += result.failed;
        reports.push(renderSuiteReport(result, path.basename(uri.fsPath)));
        diagnostics.set(uri, suiteDiagnostics(await readText(uri), result));
      }

      for (const problem of problems) { vscode.window.showWarningMessage(problem); }
      if (!reports.length) { return; }

      const summary = `${total - failed}/${total} schema test case${total === 1 ? '' : 's'} passed`;
      const action = failed
        ? await vscode.window.showWarningMessage(`✗ ${summary}.`, 'Copy report')
        : await vscode.window.showInformationMessage(`✓ ${summary}.`, 'Copy report');
      if (action === 'Copy report') {
        await vscode.env.clipboard.writeText(reports.join('\n'));
      }
    }),
  );
}
