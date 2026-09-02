// F30 — the editor surface for schema refactorings: code actions for extract /
// inline / remove-unused, the editor's own rename and find-references gestures,
// and dimmed diagnostics on unreferenced definitions.
//
// All structural work happens in `schemaRefactor`; this file only converts
// offsets to ranges and edits to workspace edits.

import * as vscode from 'vscode';
import {
  extractDefinition, inlineRef, renameDefinition, findDefinitionReferences,
  unusedDefinitions, removeUnusedDefinitions, definitionAt, definitionKeySpan,
  type RefactorResult, type TextEditOp,
} from './schemaRefactor';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { JSON_LANGS } from './languages';

/** JSON/JSONC only (F30's Out of Scope). */
const SELECTOR = JSON_LANGS.filter(l => l !== 'jsonl').map(language => ({ language, scheme: 'file' }));

const EXTRACT = 'jsonschema.refactor.extractDefinition';
const INLINE = 'jsonschema.refactor.inlineRef';
const REMOVE_UNUSED = 'jsonschema.refactor.removeUnusedDefinitions';

function toWorkspaceEdit(document: vscode.TextDocument, edits: TextEditOp[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const op of edits) {
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(op.offset), document.positionAt(op.offset + op.length)),
      op.newText,
    );
  }
  return edit;
}

async function applyOrExplain(document: vscode.TextDocument, result: RefactorResult): Promise<void> {
  if (!result.ok) { vscode.window.showInformationMessage(result.reason); return; }
  await vscode.workspace.applyEdit(toWorkspaceEdit(document, result.edits));
}

// ── Code actions (F30-FR-13) ─────────────────────────────────────────────────

export class SchemaRefactorProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.Refactor];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    if (!isJsonSchemaFile(document)) { return []; }
    const text = document.getText();
    const offset = document.offsetAt(range.start);
    const actions: vscode.CodeAction[] = [];

    // Offered only where they actually apply: each engine is asked, and a
    // refusal simply means no action (F30-FR-02).
    if (inlineRef(text, offset).ok) {
      actions.push(action('Inline this $ref', INLINE, [document.uri, offset]));
    }
    if (extractDefinition(text, offset, probeName(text)).ok) {
      actions.push(action('Extract to $defs…', EXTRACT, [document.uri, offset]));
    }
    const unused = unusedDefinitions(text);
    if (unused.length) {
      actions.push(action(
        `Remove ${unused.length} unused definition${unused.length === 1 ? '' : 's'}`,
        REMOVE_UNUSED,
        [document.uri],
      ));
    }
    return actions;
  }
}

/** A name that cannot already be taken, for probing whether extract applies. */
function probeName(text: string): string {
  let name = 'Extracted';
  while (text.includes(`"${name}"`)) { name += '_'; }
  return name;
}

function action(title: string, command: string, args: unknown[]): vscode.CodeAction {
  const codeAction = new vscode.CodeAction(title, vscode.CodeActionKind.Refactor);
  codeAction.command = { command, title, arguments: args };
  return codeAction;
}

// ── Rename & references (F30-FR-09/10/13) ────────────────────────────────────

export class SchemaRenameProvider implements vscode.RenameProvider {
  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): { range: vscode.Range; placeholder: string } {
    const site = definitionAt(document.getText(), document.offsetAt(position));
    if (!site) { throw new Error('Only $defs definitions can be renamed here.'); }
    return {
      range: new vscode.Range(document.positionAt(site.span.start), document.positionAt(site.span.end)),
      placeholder: site.name,
    };
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ): vscode.WorkspaceEdit | undefined {
    const text = document.getText();
    const site = definitionAt(text, document.offsetAt(position));
    if (!site) { return undefined; }
    // Strip quotes a user may have typed into the rename box.
    const result = renameDefinition(text, site.name, newName.replace(/^["']|["']$/g, ''));
    if (!result.ok) {
      vscode.window.showWarningMessage(result.reason);
      return undefined;
    }
    return toWorkspaceEdit(document, result.edits);
  }
}

export class SchemaReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): vscode.Location[] {
    const text = document.getText();
    const site = definitionAt(text, document.offsetAt(position));
    if (!site) { return []; }

    const spans = findDefinitionReferences(text, site.name).map(hit => hit.span);
    if (context.includeDeclaration) {
      const declaration = definitionKeySpan(text, site.name);
      if (declaration) { spans.unshift(declaration); }
    }
    return spans.map(span => new vscode.Location(
      document.uri,
      new vscode.Range(document.positionAt(span.start), document.positionAt(span.end)),
    ));
  }
}

// ── Unused-definition diagnostics (F30-FR-14) ────────────────────────────────

function refreshUnusedDiagnostics(
  collection: vscode.DiagnosticCollection,
  document: vscode.TextDocument,
): void {
  if (!isJsonSchemaFile(document)) { collection.delete(document.uri); return; }
  const diagnostics = unusedDefinitions(document.getText()).map(unused => {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(document.positionAt(unused.span.start), document.positionAt(unused.span.end)),
      `Definition "${unused.name}" is never referenced.`,
      vscode.DiagnosticSeverity.Hint,
    );
    diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    diagnostic.source = 'jsonschema';
    diagnostic.code = 'unused-definition';
    return diagnostic;
  });
  collection.set(document.uri, diagnostics);
}

export function registerSchemaRefactorings(context: vscode.ExtensionContext): void {
  const unusedDiagnostics = vscode.languages.createDiagnosticCollection('jsonschema-unused');

  context.subscriptions.push(
    unusedDiagnostics,
    vscode.languages.registerCodeActionsProvider(SELECTOR, new SchemaRefactorProvider(), {
      providedCodeActionKinds: SchemaRefactorProvider.providedCodeActionKinds,
    }),
    vscode.languages.registerRenameProvider(SELECTOR, new SchemaRenameProvider()),
    vscode.languages.registerReferenceProvider(SELECTOR, new SchemaReferenceProvider()),

    vscode.commands.registerCommand(EXTRACT, async (uri?: vscode.Uri, offset?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const at = offset ?? editor.document.offsetAt(editor.selection.start);
      const name = await vscode.window.showInputBox({
        title: 'Extract to $defs',
        prompt: 'Name for the new definition',
        validateInput: value => (value.trim() ? undefined : 'A name is required.'),
      });
      if (!name?.trim()) { return; }
      await applyOrExplain(editor.document, extractDefinition(editor.document.getText(), at, name.trim()));
      void uri;
    }),

    vscode.commands.registerCommand(INLINE, async (uri?: vscode.Uri, offset?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const at = offset ?? editor.document.offsetAt(editor.selection.start);
      await applyOrExplain(editor.document, inlineRef(editor.document.getText(), at));
      void uri;
    }),

    vscode.commands.registerCommand(REMOVE_UNUSED, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      await applyOrExplain(editor.document, removeUnusedDefinitions(editor.document.getText()));
    }),

    vscode.workspace.onDidChangeTextDocument(e => refreshUnusedDiagnostics(unusedDiagnostics, e.document)),
    vscode.workspace.onDidOpenTextDocument(doc => refreshUnusedDiagnostics(unusedDiagnostics, doc)),
    vscode.workspace.onDidCloseTextDocument(doc => unusedDiagnostics.delete(doc.uri)),
  );

  if (vscode.window.activeTextEditor) {
    refreshUnusedDiagnostics(unusedDiagnostics, vscode.window.activeTextEditor.document);
  }
}
