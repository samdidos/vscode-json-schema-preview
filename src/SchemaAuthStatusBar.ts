import * as vscode from 'vscode';
import { SchemaAuthManager } from './SchemaAuthManager';
import { findBoundSchemaPath } from './SchemaBindingManager';
import { extractInlineSchemaUrl } from './SchemaBindingManager';

export class SchemaAuthStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(
    private readonly auth: SchemaAuthManager,
    context: vscode.ExtensionContext,
  ) {
    // Priority 1 places this to the left of the binding status bar (priority 2).
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1);
    context.subscriptions.push(this.item);

    const refresh = (doc?: vscode.TextDocument) => this.update(doc);

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(e => refresh(e?.document)),
      vscode.authentication.onDidChangeSessions(() =>
        refresh(vscode.window.activeTextEditor?.document)
      ),
    );

    refresh(vscode.window.activeTextEditor?.document);
  }

  private async update(doc?: vscode.TextDocument): Promise<void> {
    if (!doc) { this.item.hide(); return; }

    const url = resolveSchemaUrl(doc);
    if (!url) { this.item.hide(); return; }

    const host = SchemaAuthManager.hostOf(url);
    const configured = await this.auth.isConfigured(url);

    if (configured) {
      this.item.text = `$(lock) ${host}`;
      this.item.tooltip = `Schema authenticated\nClick to manage credentials for ${host}`;
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = `$(unlock) ${host}`;
      this.item.tooltip = `Schema at ${host} may require authentication\nClick to configure`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    this.item.command = {
      command: 'jsonschema.configureSchemaAuth',
      title: 'Configure Schema Authentication',
      arguments: [url],
    };
    this.item.show();
  }
}

/**
 * Returns the remote schema URL associated with `doc`, checking external
 * bindings first then falling back to the inline `$schema` field/directive.
 * Returns undefined for local file schemas.
 */
function resolveSchemaUrl(doc: vscode.TextDocument): string | undefined {
  const bound = findBoundSchemaPath(doc);
  if (bound && SchemaAuthManager.isRemoteUrl(bound)) return bound;

  const inline = extractInlineSchemaUrl(doc);
  if (inline && SchemaAuthManager.isRemoteUrl(inline)) return inline;

  return undefined;
}
