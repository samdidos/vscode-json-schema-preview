import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
import { SchemaRefProvider } from './SchemaRefProvider';
import { SchemaLintManager } from './SchemaLintManager';
import { SchemaCatalogManager } from './SchemaCatalogManager';
import { bundleSchemaCommand } from './SchemaBundleCommand';
import { registerSchemaDiff } from './SchemaDiffCommand';
import { isYaml, isSupported } from './languages';
import { getCacheAutoRefresh } from './settings';
import { createSchema } from 'genson-js';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('JSON Schema Preview', { log: true });
  context.subscriptions.push(output);
  output.info('Extension "json-schema-preview" is now active');

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

  // ── Automatic schema-cache revalidation (F08-FR-14/17) ─────────────────────
  // `onOpen` revalidates at most once per schema per session; `daily` relies on
  // the cache's own 24 h throttle. Failures are swallowed inside revalidate().
  const revalidatedThisSession = new Set<string>();
  function maybeRevalidateCache(doc: vscode.TextDocument): void {
    const mode = getCacheAutoRefresh();
    if (mode === 'off') { return; }
    if (doc.uri.scheme === 'untitled') { return; }
    if (!isSupported(doc.languageId)) { return; }

    const ref = findBoundSchemaPath(doc) ?? extractInlineSchemaUrl(doc);
    if (!ref) { return; }
    const url = SchemaAuthManager.isRemoteUrl(ref) ? ref : schemaCache.getOriginalUrl(ref);
    if (!url || !schemaCache.isCached(url)) { return; }

    if (mode === 'onOpen') {
      if (revalidatedThisSession.has(url)) { return; }
      revalidatedThisSession.add(url);
    }
    void schemaCache.revalidate(url, mode);
  }

  if (vscode.window.activeTextEditor?.document) {
    const doc = vscode.window.activeTextEditor.document;
    setJsonSchemaPreviewContext(doc);
    maybeAutoPreview(doc);
    maybeRevalidateCache(doc);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => {
      if (e?.document) {
        setJsonSchemaPreviewContext(e.document);
        maybeAutoPreview(e.document);
        maybeRevalidateCache(e.document);
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
  const catalogManager = new SchemaCatalogManager(context, authManager);
  const bindingManager = new SchemaBindingManager(context, catalogManager);
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

  // ── $ref navigation & hover (F13) ─────────────────────────────────────────
  context.subscriptions.push(...SchemaRefProvider.register(schemaCache));

  // ── Schema linting (F17) ───────────────────────────────────────────────────
  new SchemaLintManager().register(context);

  // ── Schema diff (F15) ──────────────────────────────────────────────────────
  registerSchemaDiff(context, authManager);

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
    vscode.commands.registerCommand('jsonschema.validateFile',       validateCurrentFile(authManager, schemaCache)),

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

    vscode.commands.registerCommand('jsonschema.bundleSchema', bundleSchemaCommand(authManager, schemaCache)),

    vscode.commands.registerCommand('jsonschema.inferSchema', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a JSON or YAML file to generate a schema from it.');
        return;
      }

      const doc = editor.document;
      let data: unknown;
      try {
        const { stripJsoncComments, parseJsonl, isToml, parseToml } = await import('./languages');
        const text = doc.getText();
        if (isYaml(doc.languageId)) {
          const YAML = await import('yaml');
          data = YAML.parse(text);
        } else if (isToml(doc.languageId)) {
          // parseToml already normalises TOML dates to ISO strings so genson-js
          // infers them as { type: "string" } (F11-FR-10).
          data = parseToml(text);
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

    // ── Generate a valid sample instance from a schema (F16) ─────────────────
    vscode.commands.registerCommand('jsonschema.generateSampleData', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isJsonSchemaFile(editor.document)) {
        vscode.window.showInformationMessage('Open a JSON Schema file to generate sample data from it.');
        return;
      }
      const doc = editor.document;
      const { parseSchemaText, parseRef, refKind, parseJsonPointer, resolvePointer } =
        await import('./schemaPointer');
      const { generateAndValidate } = await import('./sampleDataGenerator');

      const root = parseSchemaText(doc.getText(), doc.languageId);
      if (root === undefined) {
        vscode.window.showErrorMessage('Cannot parse the schema file.');
        return;
      }

      const format = await vscode.window.showQuickPick(
        [
          { label: 'JSON', id: 'json' as const },
          { label: 'YAML', id: 'yaml' as const },
        ],
        { title: 'Sample data format', placeHolder: 'Choose the output format' },
      );
      if (!format) { return; }

      // Ref resolver: local pointers resolve within the root schema; relative
      // and cached-remote refs are read best-effort (F16-FR-06).
      const resolveRef = (ref: string): unknown => {
        const { uri, fragment } = parseRef(ref);
        const segments = parseJsonPointer(fragment);
        const kind = refKind(ref);
        if (kind === 'local') { return resolvePointer(root, segments); }
        let text: string | undefined;
        if (kind === 'remote') {
          text = schemaCache.readCached(uri || ref);
        } else {
          try {
            text = fs.readFileSync(path.resolve(path.dirname(doc.uri.fsPath), uri), 'utf-8');
          } catch { text = undefined; }
        }
        if (text === undefined) { return undefined; }
        const targetLang = uri.endsWith('.yaml') || uri.endsWith('.yml') ? 'yaml' : 'json';
        return resolvePointer(parseSchemaText(text, targetLang), segments);
      };

      const result = generateAndValidate(root, { resolveRef });
      if (!result.ok) {
        vscode.window.showErrorMessage(
          `Could not generate valid sample data: ${result.errors.slice(0, 5).join('; ')}`,
        );
        return;
      }

      const content = format.id === 'yaml'
        ? (await import('yaml')).stringify(result.value)
        : JSON.stringify(result.value, null, 2);
      const newDoc = await vscode.workspace.openTextDocument({ content, language: format.id });
      await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);
    }),
  );
}

export function deactivate() {
  disposeAllPanels();
}
