import * as vscode from 'vscode';
import { isJsonSchemaFile, openJsonSchema, openJsonSchemaFiles, previewJsonSchema } from './PreviewWebPanel';
import { openConfigPanel, openConfigFile } from './ConfigWebPanel';
import { openSchemaEditor } from './SchemaEditorPanel';


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
    vscode.commands.registerCommand('jsonschema.preview',   previewJsonSchema(context)),
    vscode.commands.registerCommand('jsonschema.edit',      (uri: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) openSchemaEditor(context, target);
    }),
    vscode.commands.registerCommand('jsonschema.configure', () => openConfigPanel(context)),
    vscode.commands.registerCommand('jsonschema.openConfig', () => openConfigFile()),
  );
}

export function deactivate() {}
