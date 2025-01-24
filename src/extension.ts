import * as vscode from 'vscode';
import { isJsonSchemaFile, openJsonSchema, previewJsonSchema } from './PreviewWebPanel';


export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "json-schema-preview" is now active');

  // sets context to show "Json Schema Preview" button on Editor Title Bar
  function setJsonSchemaPreviewContext(document: vscode.TextDocument) {
    const isJsonSchema = isJsonSchemaFile(document);
    console.log('Setting context for jsonschema.isJsonSchema', isJsonSchema, document.uri.fsPath);
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
      console.log('Reloading jsonschema file', document.uri.fsPath);
      openJsonSchema(context, document.uri);
    }
    if (vscode.window.activeTextEditor?.document) {
      setJsonSchemaPreviewContext(vscode.window.activeTextEditor.document);
    }
  });


  context.subscriptions.push(vscode.commands.registerCommand('jsonschema.preview', previewJsonSchema(context)));

export function deactivate() {}
