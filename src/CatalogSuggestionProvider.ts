// F12-FR-12/13 — "Bind suggested schema" on unbound data files whose name
// matches a cached catalog entry. The action only opens the normal binding
// flow with the entry's URL preset; nothing is written without the user
// choosing a scope there.
import * as vscode from 'vscode';
import { suggestedEntries, type CatalogEntry } from './schemaCatalog';
import { extractInlineSchemaUrl, findBoundSchemaPath } from './SchemaBindingManager';
import { isSupported } from './languages';

/** The slice of SchemaCatalogManager this provider needs: cache only, no fetch. */
export interface CachedCatalog {
  getCachedEntries(): CatalogEntry[];
}

export class CatalogSuggestionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(private readonly catalog: CachedCatalog) {}

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] {
    // First line only (F12-FR-13): where the cursor is on open, without a
    // lightbulb on every line of the file.
    if (range.start.line !== 0 || !isSupported(document.languageId)) { return []; }
    if (extractInlineSchemaUrl(document) || findBoundSchemaPath(document)) { return []; }

    const fileName = vscode.workspace.asRelativePath(document.uri, false);
    return suggestedEntries(this.catalog.getCachedEntries(), fileName).map(entry => {
      const action = new vscode.CodeAction(
        `Bind suggested schema "${entry.name}"`,
        vscode.CodeActionKind.QuickFix,
      );
      action.command = {
        command: 'jsonschema.bindToCurrentFile',
        title: 'Bind Schema',
        arguments: [document.uri, entry.url],
      };
      return action;
    });
  }
}
