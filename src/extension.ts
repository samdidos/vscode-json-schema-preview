import * as vscode from 'vscode';
import { isJsonSchemaFile, openJsonSchema, openJsonSchemaFiles, previewJsonSchema } from './PreviewWebPanel';
import { openConfigPanel } from './ConfigWebPanel';


export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "json-schema-preview" is now active');

  function setJsonSchemaPreviewContext(document: vscode.TextDocument) {
    const isJsonSchema = isJsonSchemaFile(document);
    vscode.commands.executeCommand('setContext', 'jsonschema.isJsonSchema', isJsonSchema);
  }

  if (vscode.window.activeTextEditor?.document) {
    setJsonSchemaPreviewContext(vscode.window.activeTextEditor.document);
  }

  vscode.window.onDidChangeActiveTextEditor(e => {
    if (e?.document) {
      setJsonSchemaPreviewContext(e.document);
    }
  });

  vscode.workspace.onDidSaveTextDocument(document => {
    if (openJsonSchemaFiles[document.uri.fsPath]) {
      openJsonSchema(context, document.uri);
    }
    if (vscode.window.activeTextEditor?.document) {
      setJsonSchemaPreviewContext(vscode.window.activeTextEditor.document);
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonschema.preview', previewJsonSchema(context)),
    vscode.commands.registerCommand('jsonschema.configure', () => openConfigPanel(context)),
  );
}

export function deactivate() {}
