import * as vscode from 'vscode';
import * as path from 'path';
import {
  isJsonSchemaFile,
  openJsonSchema,
  openJsonSchemaFiles,
  previewJsonSchema,
  scheduleLiveUpdate,
  disposeAllPanels,
} from './PreviewWebPanel';
import { openConfigFile } from './ConfigWebPanel';
import { openSchemaEditor } from './SchemaEditorPanel';
import {
  SchemaBindingManager,
  findBoundSchemaPath,
  extractInlineSchemaUrl,
} from './SchemaBindingManager';
import { validateCurrentFile, validationDiagnostics } from './ValidationManager';
import { SchemaAuthManager, AuthRequiredError } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { SchemaAuthCodeActionProvider } from './SchemaAuthCodeActionProvider';
import { SchemaAuthStatusBar } from './SchemaAuthStatusBar';
import { isYaml } from './languages';
import { createSchema } from 'genson-js';

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "json-schema-preview" is now active');

  // ── Auth infrastructure (created first; other components depend on these) ──
  const authManager = new SchemaAuthManager(context);
  const schemaCache = new SchemaCache(context, authManager);

  function setJsonSchemaPreviewContext(document: vscode.TextDocument) {
    const isJsonSchema = isJsonSchemaFile(document);
    vscode.commands.executeCommand('setContext', 'jsonschema.isJsonSchema', isJsonSchema);
  }

  function maybeAutoPreview(doc: vscode.TextDocument) {
    const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
    if (!cfg.get<boolean>('autoOpen')) { return; }
    if (!isJsonSchemaFile(doc)) { return; }
    if (doc.uri.scheme === 'untitled') { return; }
    openJsonSchema(context, doc.uri, /* silent */ true);
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
      if (!isJsonSchemaFile(doc)) { return; }
      const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
      if (!cfg.get<boolean>('liveUpdate')) { return; }
      scheduleLiveUpdate(context, doc);
    }),

    validationDiagnostics,
  );

  // ── Binding manager & auth status bar ─────────────────────────────────────
  const bindingManager = new SchemaBindingManager(context);
  new SchemaAuthStatusBar(authManager, context);

  // ── Code action provider (Options 1: lightbulb on $schema lines) ──────────
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: 'json' },
        { language: 'jsonc' },
        { language: 'yaml' },
        { language: 'yml' },
      ],
      new SchemaAuthCodeActionProvider(authManager, schemaCache),
      { providedCodeActionKinds: SchemaAuthCodeActionProvider.providedCodeActionKinds },
    ),
  );

  // ── Commands ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonschema.preview',  previewJsonSchema(context)),

    vscode.commands.registerCommand('jsonschema.edit', (uri: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) { openSchemaEditor(context, target); }
    }),

    vscode.commands.registerCommand('jsonschema.configure',          () => openConfigFile()),
    vscode.commands.registerCommand('jsonschema.openConfig',         () => openConfigFile()),
    vscode.commands.registerCommand('jsonschema.bindToCurrentFile',  (uri?: vscode.Uri) => bindingManager.bindToCurrentFile(uri)),
    vscode.commands.registerCommand('jsonschema.validateFile',       validateCurrentFile(authManager)),

    // ── Option 2: configure auth (entry point from status bar, code action, errors) ──
    vscode.commands.registerCommand('jsonschema.configureSchemaAuth', async (url?: string) => {
      if (!url) {
        const doc = vscode.window.activeTextEditor?.document;
        url = doc
          ? (findBoundSchemaPath(doc) ?? extractInlineSchemaUrl(doc) ?? undefined)
          : undefined;
      }
      if (!url || !SchemaAuthManager.isRemoteUrl(url)) {
        vscode.window.showInformationMessage('No remote schema URL found for the current file.');
        return;
      }
      const configured = await authManager.configureAuth(url);
      if (configured) {
        const host = SchemaAuthManager.hostOf(url);
        const action = await vscode.window.showInformationMessage(
          `Authentication configured for ${host}. Cache the schema locally to fix IntelliSense warnings?`,
          'Cache Schema',
          'Not Now',
        );
        if (action === 'Cache Schema') {
          await vscode.commands.executeCommand('jsonschema.cacheSchemaLocally', url);
        }
      }
    }),

    // ── Option 4: download schema locally and redirect json.schemas / yaml.schemas ──
    vscode.commands.registerCommand('jsonschema.cacheSchemaLocally', async (url?: string, docUri?: vscode.Uri) => {
      if (!url) {
        const doc = vscode.window.activeTextEditor?.document;
        url = doc ? (findBoundSchemaPath(doc) ?? extractInlineSchemaUrl(doc) ?? undefined) : undefined;
        docUri ??= doc?.uri;
      }
      if (!url) {
        vscode.window.showInformationMessage('No schema URL found for the current file.');
        return;
      }
      if (!SchemaAuthManager.isRemoteUrl(url)) {
        const original = schemaCache.getOriginalUrl(url);
        vscode.window.showInformationMessage(
          original
            ? 'Schema is already cached locally. Run "JSON Schema: Refresh Schema Cache" to re-download.'
            : 'No remote schema URL found for the current file.',
        );
        return;
      }

      const doc = docUri
        ? await vscode.workspace.openTextDocument(docUri)
        : vscode.window.activeTextEditor?.document;
      if (!doc) { return; }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Caching schema from ${SchemaAuthManager.hostOf(url)}…`,
        },
        async () => {
          try {
            const localPath = await schemaCache.download(url!);
            await bindingManager.redirectToLocalCache(localPath, doc);
            vscode.window.showInformationMessage(
              `Schema cached. Language server will now use the local copy for ${path.basename(doc.uri.fsPath)}.`,
            );
          } catch (e) {
            if (e instanceof AuthRequiredError) {
              const action = await vscode.window.showErrorMessage(
                `Schema at ${SchemaAuthManager.hostOf(e.url)} requires authentication. Configure it first.`,
                'Configure Auth',
              );
              if (action === 'Configure Auth') {
                vscode.commands.executeCommand('jsonschema.configureSchemaAuth', e.url);
              }
            } else {
              vscode.window.showErrorMessage(`Failed to cache schema: ${(e as Error).message}`);
            }
          }
        },
      );
    }),

    // ── Re-download a previously cached schema ────────────────────────────────
    vscode.commands.registerCommand('jsonschema.refreshSchemaCache', async (url?: string) => {
      if (!url) {
        const doc = vscode.window.activeTextEditor?.document;
        url = doc ? (schemaCache.getOriginalUrl(findBoundSchemaPath(doc) ?? '') ?? undefined) : undefined;
      }
      if (!url) {
        vscode.window.showInformationMessage('No cached schema found for the current file.');
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Refreshing schema cache…' },
        async () => {
          try {
            await schemaCache.download(url!);
            vscode.window.showInformationMessage('Schema cache refreshed.');
          } catch (e) {
            vscode.window.showErrorMessage(`Failed to refresh cache: ${(e as Error).message}`);
          }
        },
      );
    }),

    vscode.commands.registerCommand('jsonschema.inferSchema', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a JSON or YAML file to generate a schema from it.');
        return;
      }

      const doc = editor.document;
      let data: unknown;
      try {
        const { stripJsoncComments, parseJsonl } = await import('./languages');
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
