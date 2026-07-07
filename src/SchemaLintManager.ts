// F17 — schema linting manager. Owns a dedicated DiagnosticCollection, runs the
// pure linter (schemaLinter.ts) debounced on change, and exposes quick fixes as
// a CodeActionProvider. Kept thin; all rule logic lives in the pure module.
import * as vscode from 'vscode';
import { lintSchema, type LintFinding, type Sev } from './schemaLinter';
import { getLintEnabled, getLintRuleSeverities } from './settings';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { isSupported } from './languages';
import { computeJsonSchemaInsertEdits, computeYamlSchemaUpsertEdit } from './SchemaBindingManager';

const SOURCE = 'json-schema-lint';
const DEBOUNCE_MS = 400;

const SELECTOR: vscode.DocumentSelector = [
  { language: 'json' }, { language: 'jsonc' }, { language: 'yaml' }, { language: 'yml' },
];

// Meta-schema URIs offered by the insert-$schema quick fix (2020-12 first).
const DRAFTS = [
  'https://json-schema.org/draft/2020-12/schema',
  'https://json-schema.org/draft/2019-09/schema',
  'http://json-schema.org/draft-07/schema#',
];

export class SchemaLintManager implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly diagnostics = vscode.languages.createDiagnosticCollection(SOURCE);
  private readonly findingsByUri = new Map<string, LintFinding[]>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.diagnostics,
      vscode.languages.registerCodeActionsProvider(SELECTOR, this, {
        providedCodeActionKinds: SchemaLintManager.providedCodeActionKinds,
      }),
      vscode.workspace.onDidOpenTextDocument(doc => this.lintDocument(doc)),
      vscode.workspace.onDidChangeTextDocument(e => this.scheduleLint(e.document)),
      vscode.workspace.onDidCloseTextDocument(doc => this.clear(doc)),
      vscode.commands.registerCommand('jsonschema.lint.insertSchemaDeclaration', () =>
        this.insertSchemaDeclaration()),
    );
    if (vscode.window.activeTextEditor?.document) {
      // Never let a lint failure abort extension activation.
      try { this.lintDocument(vscode.window.activeTextEditor.document); } catch { /* ignore */ }
    }
  }

  /** Lint one document now, updating diagnostics (F17-FR-01/02/11). */
  lintDocument(document: vscode.TextDocument): void {
    const uriKey = document.uri.toString();
    if (!this.isLintCandidate(document)) {
      this.diagnostics.delete(document.uri);
      this.findingsByUri.delete(uriKey);
      return;
    }

    const overrides = getLintRuleSeverities();
    const findings = lintSchema(document.getText(), document.languageId);
    const kept: LintFinding[] = [];
    const diags: vscode.Diagnostic[] = [];

    for (const f of findings) {
      const sev = resolveSeverity(f.ruleId, f.defaultSeverity, overrides);
      if (sev === 'off') { continue; }
      kept.push(f);
      const range = new vscode.Range(
        document.positionAt(f.offset),
        document.positionAt(f.offset + Math.max(1, f.length)),
      );
      const diag = new vscode.Diagnostic(range, f.message, toVsSeverity(sev));
      diag.code = f.ruleId;
      diag.source = SOURCE;
      diags.push(diag);
    }

    this.findingsByUri.set(uriKey, kept);
    this.diagnostics.set(document.uri, diags);
  }

  // ── Code actions (F17-FR-12) ───────────────────────────────────────────────

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    const findings = this.findingsByUri.get(document.uri.toString()) ?? [];
    const actions: vscode.CodeAction[] = [];
    for (const f of findings) {
      if (!f.fix) { continue; }
      const start = document.offsetAt(range.start);
      const end = document.offsetAt(range.end);
      if (f.offset + Math.max(1, f.length) < start || f.offset > end) { continue; }

      const action = new vscode.CodeAction(f.fix.title, vscode.CodeActionKind.QuickFix);
      if (f.fix.kind === 'command' && f.fix.command) {
        action.command = { command: f.fix.command, title: f.fix.title };
      } else {
        const edit = new vscode.WorkspaceEdit();
        if (f.fix.kind === 'insertText' && f.fix.atOffset !== undefined) {
          const pos = document.positionAt(f.fix.atOffset);
          edit.replace(document.uri, new vscode.Range(pos, pos), f.fix.text ?? '');
        } else if (f.fix.kind === 'replaceRange' && f.fix.offset !== undefined) {
          const r = new vscode.Range(
            document.positionAt(f.fix.offset),
            document.positionAt(f.fix.offset + (f.fix.length ?? 0)),
          );
          edit.replace(document.uri, r, f.fix.text ?? '');
        }
        action.edit = edit;
      }
      actions.push(action);
    }
    return actions;
  }

  // ── Insert-$schema command ─────────────────────────────────────────────────

  private async insertSchemaDeclaration(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const doc = editor.document;
    const draft = await vscode.window.showQuickPick(DRAFTS, {
      title: 'Insert $schema declaration',
      placeHolder: 'Choose the JSON Schema draft',
    });
    if (!draft) { return; }

    const text = doc.getText();
    const isYamlDoc = doc.languageId === 'yaml' || doc.languageId === 'yml';
    const edit = new vscode.WorkspaceEdit();
    if (isYamlDoc) {
      // A schema file's meta-schema is a plain `$schema:` key, not a
      // yaml-language-server binding directive — hence `false`.
      const e = computeYamlSchemaUpsertEdit(text, draft, false);
      const r = new vscode.Range(doc.positionAt(e.offset), doc.positionAt(e.offset + e.length));
      edit.replace(doc.uri, r, e.content);
    } else {
      const result = computeJsonSchemaInsertEdits(text, draft, { insertSpaces: true, tabSize: 2 });
      if ('error' in result) { vscode.window.showErrorMessage(result.error); return; }
      for (const e of result.edits) {
        const r = new vscode.Range(doc.positionAt(e.offset), doc.positionAt(e.offset + e.length));
        edit.replace(doc.uri, r, e.content);
      }
    }
    await vscode.workspace.applyEdit(edit);
  }

  // ── Lifecycle helpers ───────────────────────────────────────────────────────

  /** Shared with lintDocument() so scheduling and the actual lint gate never drift apart. */
  private isLintCandidate(document: vscode.TextDocument): boolean {
    return getLintEnabled() && isSupported(document.languageId) && isSchemaFileForLint(document);
  }

  private scheduleLint(document: vscode.TextDocument): void {
    // Skip the timer entirely for documents that can never lint (F17-FR-03),
    // rather than allocating and clearing one on every keystroke in every file.
    if (!this.isLintCandidate(document)) { return; }
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) { clearTimeout(existing); }
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      this.lintDocument(document);
    }, DEBOUNCE_MS));
  }

  /** Cancels any pending debounced lint for `document` too (F17-FR-02) — otherwise
   *  a document edited then closed within the debounce window would still lint
   *  after close, re-populating diagnostics this same call is meant to clear. */
  private clear(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const timer = this.timers.get(key);
    if (timer) { clearTimeout(timer); this.timers.delete(key); }
    this.diagnostics.delete(document.uri);
    this.findingsByUri.delete(key);
  }
}

/**
 * A document is lintable when F01-FR-02 detects it (a `$schema` declaration) or
 * its filename follows the `*.schema.*` convention — the latter so a
 * schema-named file that forgot `$schema` still gets require-schema-declaration
 * (F17-FR-01).
 */
function isSchemaFileForLint(document: vscode.TextDocument): boolean {
  return isJsonSchemaFile(document) || /\.schema\.(json|jsonc|ya?ml)$/i.test(document.uri.fsPath);
}

function resolveSeverity(ruleId: string, fallback: Sev, overrides: Record<string, string>): Sev | 'off' {
  const o = overrides[ruleId];
  return o === 'off' || o === 'hint' || o === 'info' || o === 'warning' ? o : fallback;
}

function toVsSeverity(sev: Sev): vscode.DiagnosticSeverity {
  switch (sev) {
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    case 'info': return vscode.DiagnosticSeverity.Information;
    default: return vscode.DiagnosticSeverity.Hint;
  }
}
