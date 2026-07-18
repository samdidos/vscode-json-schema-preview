// F21 — the VS Code layer for validation quick fixes. Holds the fixes computed
// by the last F03 validation run (keyed by document URI) and exposes them as
// QuickFix code actions on the validation diagnostics. All fix *logic* lives in
// the pure `validationFix` module; this class is thin glue.
import * as vscode from 'vscode';
import { type ValidationFix, computeFixEdits, fixTargetPointer } from './validationFix';

const VALIDATION_SOURCE = 'JSON Schema';

export class ValidationFixProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly byUri = new Map<string, ValidationFix[]>();

  /** Replace the recorded fixes for a document (F21-FR-09). An empty list clears. */
  record(uri: vscode.Uri, fixes: ValidationFix[]): void {
    const key = uri.toString();
    if (fixes.length) { this.byUri.set(key, fixes); }
    else { this.byUri.delete(key); }
  }

  /** Forget any recorded fixes for a document. */
  clear(uri: vscode.Uri): void {
    this.byUri.delete(uri.toString());
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const fixes = this.byUri.get(document.uri.toString());
    if (!fixes?.length) { return []; }

    // Only fire on our own validation diagnostics (F21-FR-07).
    const diagnostics = context.diagnostics.filter(d => d.source === VALIDATION_SOURCE);
    if (!diagnostics.length) { return []; }

    // F21-FR-08: offer a fix only when the error it addresses is among the
    // diagnostics at the cursor. Matching by the error's instance path (carried
    // on the diagnostic `code`) — rather than geometric range overlap — is
    // robust to the diagnostic sitting on a property key while the fix rewrites
    // the value on the same line.
    const diagnosticPaths = new Set(diagnostics.map(d => String(d.code ?? '')));

    const text = document.getText();
    const actions: vscode.CodeAction[] = [];
    for (const fix of fixes) {
      if (!diagnosticPaths.has(fixTargetPointer(fix))) { continue; }

      const edits = computeFixEdits(text, fix);
      if (!edits.length) { continue; } // stale / target gone (F21-FR-06)

      const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
      const edit = new vscode.WorkspaceEdit();
      for (const e of edits) {
        const r = new vscode.Range(document.positionAt(e.offset), document.positionAt(e.offset + e.length));
        edit.replace(document.uri, r, e.content);
      }
      action.edit = edit;
      action.diagnostics = diagnostics;
      // F25: the closest enum near-miss is the editor's default fix.
      if (fix.preferred) { action.isPreferred = true; }
      actions.push(action);
    }
    return actions;
  }
}
