import * as vscode from 'vscode';
import {
  isJsonSchemaFile,
  openJsonSchema,
  openJsonSchemaFiles,
  previewJsonSchema,
  scheduleLiveUpdate,
  disposeAllPanels,
} from './PreviewWebPanel';
import { openConfigPanel, openConfigFile } from './ConfigWebPanel';
import { openSchemaEditor } from './SchemaEditorPanel';
import { SchemaBindingManager } from './SchemaBindingManager';
import { validateCurrentFile, validationDiagnostics } from './ValidationManager';
import { createSchema } from 'genson-js';

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "json-schema-preview" is now active');

  function setJsonSchemaPreviewContext(document: vscode.TextDocument) {
    const isJsonSchema = isJsonSchemaFile(document);
    vscode.commands.executeCommand('setContext', 'jsonschema.isJsonSchema', isJsonSchema);
  }

  function maybeAutoPreview(doc: vscode.TextDocument) {
    const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
    if (!cfg.get<boolean>('autoOpen')) return;
    if (!isJsonSchemaFile(doc)) return;
    if (doc.uri.scheme === 'untitled') return; // unsaved files have no path for Python
    openJsonSchema(context, doc.uri);
  }

  if (vscode.window.activeTextEditor?.document) {
    const doc = vscode.window.activeTextEditor.document;
    setJsonSchemaPreviewContext(doc);
    maybeAutoPreview(doc);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => {
      if (e?.document) {
        setJsonSchemaPreviewContext(e.document);
        maybeAutoPreview(e.document);
      }
    }),

    vscode.workspace.onDidOpenTextDocument(doc => {
      maybeAutoPreview(doc);
    }),

    vscode.workspace.onDidSaveTextDocument(document => {
      if (openJsonSchemaFiles[document.uri.fsPath]) {
        openJsonSchema(context, document.uri);
      }
      if (vscode.window.activeTextEditor?.document) {
        setJsonSchemaPreviewContext(vscode.window.activeTextEditor.document);
      }
    }),

    vscode.workspace.onDidChangeTextDocument(e => {
      const doc = e.document;
      if (!isJsonSchemaFile(doc)) return;
      const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
      if (!cfg.get<boolean>('liveUpdate')) return;
      scheduleLiveUpdate(context, doc);
    }),

    validationDiagnostics,
  );

  const bindingManager = new SchemaBindingManager(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonschema.preview',   previewJsonSchema(context)),

    vscode.commands.registerCommand('jsonschema.edit', (uri: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) openSchemaEditor(context, target);
    }),

    vscode.commands.registerCommand('jsonschema.configure',           () => openConfigPanel(context)),
    vscode.commands.registerCommand('jsonschema.openConfig',          () => openConfigFile()),
    vscode.commands.registerCommand('jsonschema.bindToCurrentFile',   () => bindingManager.bindToCurrentFile()),
    vscode.commands.registerCommand('jsonschema.validateFile',        validateCurrentFile()),

    vscode.commands.registerCommand('jsonschema.inferSchema', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a JSON or YAML file to generate a schema from it.');
        return;
      }

      const doc = editor.document;
      let data: unknown;
      try {
        const { isYaml, stripJsoncComments, parseJsonl } = await import('./languages');
        const text = doc.getText();
        if (isYaml(doc.languageId)) {
          const YAML = await import('yaml');
          data = YAML.parse(text);
        } else if (doc.languageId === 'jsonl') {
          data = parseJsonl(text);
        } else if (doc.languageId === 'jsonc') {
          data = JSON.parse(stripJsoncComments(text));
        } else {
          data = JSON.parse(text);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Cannot parse file: ${(e as Error).message}`);
        return;
      }

      const schema = createSchema(data as object) as Record<string, unknown>;
      schema.$schema = 'http://json-schema.org/draft-07/schema#';

      const newDoc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(schema, null, 2),
        language: 'json',
      });
      await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);
      vscode.window.showInformationMessage(
        'Schema inferred — save the file and bind it to use it for validation.'
      );
    }),
  );
}

export function deactivate() {
  disposeAllPanels();
}
