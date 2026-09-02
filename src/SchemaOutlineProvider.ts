// F31 — document-symbol provider. Thin wiring: `buildOutline` does the work and
// this maps its symbol tree onto VS Code's, lighting up the Outline view,
// breadcrumbs, Go-to-Symbol and sticky scroll from one contribution.

import * as vscode from 'vscode';
import { buildOutline, type OutlineKind, type OutlineNode } from './schemaOutline';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { ALL_LANGS } from './languages';

/** F31-FR-08 — schema types onto the editor's symbol icons. */
const KIND_MAP: Record<OutlineKind, vscode.SymbolKind> = {
  schema: vscode.SymbolKind.File,
  section: vscode.SymbolKind.Namespace,
  object: vscode.SymbolKind.Object,
  array: vscode.SymbolKind.Array,
  string: vscode.SymbolKind.String,
  number: vscode.SymbolKind.Number,
  boolean: vscode.SymbolKind.Boolean,
  null: vscode.SymbolKind.Null,
  ref: vscode.SymbolKind.Interface,
  unknown: vscode.SymbolKind.Field,
};

export class SchemaOutlineProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    // F31-FR-09 — data files keep the editor's own JSON outline.
    if (!isJsonSchemaFile(document)) { return []; }
    const fallback = document.uri.path.split('/').pop() || 'schema';
    return buildOutline(document.getText(), document.languageId, fallback)
      .map(node => toSymbol(node, document));
  }
}

function toSymbol(node: OutlineNode, document: vscode.TextDocument): vscode.DocumentSymbol {
  const range = new vscode.Range(
    document.positionAt(node.span.start),
    document.positionAt(node.span.end),
  );
  const selection = new vscode.Range(
    document.positionAt(node.selectionSpan.start),
    document.positionAt(node.selectionSpan.end),
  );
  const symbol = new vscode.DocumentSymbol(
    node.name,
    node.detail,
    KIND_MAP[node.kind] ?? vscode.SymbolKind.Field,
    range,
    // VS Code requires the selection range to sit inside the full range; a
    // degenerate span (an empty document, a YAML node with no key range) would
    // otherwise make the whole outline disappear.
    range.contains(selection) ? selection : range,
  );
  symbol.children = node.children.map(child => toSymbol(child, document));
  return symbol;
}

export function registerSchemaOutline(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      ALL_LANGS.map(language => ({ language, scheme: 'file' })),
      new SchemaOutlineProvider(),
      { label: 'JSON Schema' },
    ),
  );
}
