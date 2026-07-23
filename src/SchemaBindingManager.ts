import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { modify, parseTree, Edit as JsoncEdit, FormattingOptions } from 'jsonc-parser';
import { isSupported, isYaml, isToml, stripJsoncComments } from './languages';
import { truncateStart } from './statusBarFormat';
import type { CatalogEntry } from './schemaCatalog';
import {
  jsonValidationSources, catalogSources, matchNativeSchema, nativeSchemaLabel,
  type NativeSchemaSource,
} from './nativeSchema';

/** The slice of SchemaCatalogManager the binding manager depends on. */
interface CatalogPort {
  browse(fileName: string): Promise<string | undefined>;
  getCachedEntries?(): CatalogEntry[];
  warm?(): Promise<void>;
}

/** Sentinel scope value for an inline `$schema` binding (F10) — distinct from
 * `vscode.ConfigurationTarget`'s numeric values so it can flow through the
 * same scope-picker / bind pipeline without colliding with a real target. */
export const INLINE_SCOPE = 'inline' as const;
export type BindingTarget = vscode.ConfigurationTarget | typeof INLINE_SCOPE;

// ---------------------------------------------------------------------------
// Legacy session-binding cleanup
// These constants and the interface are kept only to clean up any temp bindings
// written by older versions of the extension. The session-binding feature has
// been removed; this code runs once on startup and is a no-op for new installs.
// ---------------------------------------------------------------------------

const TEMP_KEY = 'jsonschema.temporaryBindings';
const TEMP_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

interface TempBindingRecord {
  relFile: string;
  schemaRef: string;
  isYaml: boolean;
  folderUri: string;
  addedAt?: number;
}

/**
 * Manages the status bar item and settings bindings that link JSON/YAML data
 * files to JSON Schema files for validation. Supports workspace-file, folder,
 * and user scope, local file paths, and remote URLs.
 */
export class SchemaBindingManager {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly ctx: vscode.ExtensionContext;
  private readonly catalog?: CatalogPort;
  private catalogWarmStarted = false;

  constructor(
    context: vscode.ExtensionContext,
    catalog?: CatalogPort,
  ) {
    this.ctx = context;
    this.catalog = catalog;
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 2);
    this.statusBar.command = 'jsonschema.bindToCurrentFile';
    context.subscriptions.push(this.statusBar);

    // Clean up any temp bindings left by previous extension versions
    this.cleanupTemporaryBindings();

    const refresh = () => this.refresh(vscode.window.activeTextEditor?.document);

    vscode.window.onDidChangeActiveTextEditor(e => this.refresh(e?.document), null, context.subscriptions);
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('json.schemas') || e.affectsConfiguration('yaml.schemas')) {
        refresh();
      }
    }, null, context.subscriptions);

    refresh();
  }

  // ---------------------------------------------------------------------------
  // Legacy cleanup (session bindings written by older extension versions)
  // ---------------------------------------------------------------------------

  async cleanupTemporaryBindings() {
    const temps = this.ctx.workspaceState.get<TempBindingRecord[]>(TEMP_KEY, []);
    if (!temps.length) {return;}

    const now = Date.now();
    const deferred: TempBindingRecord[] = [];

    for (const record of temps) {
      if (record.addedAt !== undefined && now - record.addedAt > TEMP_EXPIRY_MS) {continue;}

      const folder = vscode.workspace.workspaceFolders?.find(
        f => f.uri.toString() === record.folderUri
      );
      if (!folder) {
        deferred.push(record);
        continue;
      }

      await this.writeRemoveBinding(
        record.relFile, record.isYaml, folder.uri,
        vscode.ConfigurationTarget.WorkspaceFolder
      );
    }

    await this.ctx.workspaceState.update(TEMP_KEY, deferred);
  }

  // ---------------------------------------------------------------------------
  // Status bar
  // ---------------------------------------------------------------------------

  private refresh(doc?: vscode.TextDocument) {
    if (!doc || !isSupported(doc.languageId)) {
      this.statusBar.hide();
      return;
    }
    // An inline $schema field takes precedence over any settings-based binding (F10-FR-15).
    const inline = extractInlineSchemaUrl(doc);
    const settingsBinding = findBoundSchemaPath(doc);
    const native = (!inline && !settingsBinding) ? this.detectNativeSchema(doc) : undefined;
    if (inline) {
      this.statusBar.text = `$(file-symlink-file) Schema: ${truncateStart(path.basename(inline))}`;
      this.statusBar.tooltip = settingsBinding
        ? `Inline $schema in this file: ${inline}\n` +
          `Note: a settings binding also exists (${settingsBinding}) but is overridden by the inline value\n` +
          `Click to change or remove`
        : `Inline $schema in this file: ${inline}\nClick to change or remove`;
    } else if (settingsBinding) {
      this.statusBar.text = `$(check) Schema: ${truncateStart(path.basename(settingsBinding))}`;
      this.statusBar.tooltip = `Schema bound: ${settingsBinding}\nClick to change or remove`;
    } else if (native) {
      // No explicit binding — but VS Code resolves a schema natively
      // (F04-FR-15). Reflect that instead of a misleading "unbound".
      const label = truncateStart(nativeSchemaLabel(native));
      const via = native.origin === 'catalog' ? 'the schema catalog' : 'an installed extension';
      this.statusBar.text = `$(check) Schema: ${label} (auto)`;
      this.statusBar.tooltip =
        `Schema resolved automatically by VS Code (via ${via}):\n${native.url}\n\n` +
        `JSON Schema Preview's own features (preview, validate, sample data) use this ` +
        `schema automatically — click to set an explicit binding instead.`;
    } else {
      this.statusBar.text = `$(circle-slash) Schema: unbound`;
      this.statusBar.tooltip = 'No JSON Schema bound to this file\nClick to bind one';
    }
    this.statusBar.show();
  }

  /**
   * Find a schema VS Code resolves natively for `doc` (F04-FR-15): an installed
   * extension's `jsonValidation` (in-memory) or a cached catalog entry. Kicks off
   * a one-time background catalog warm so a SchemaStore-only association (e.g. a
   * commitlint config) can light up on a later refresh. Returns undefined on any
   * error so a detection failure never breaks the status bar.
   */
  detectNativeSchema(doc: vscode.TextDocument) {
    try {
      const fileName = vscode.workspace.asRelativePath(doc.uri, false);
      const sources: NativeSchemaSource[] = [
        ...jsonValidationSources(vscode.extensions.all),
        ...(this.catalog?.getCachedEntries ? catalogSources(this.catalog.getCachedEntries()) : []),
      ];
      this.warmCatalogOnce();
      return matchNativeSchema(fileName, sources);
    } catch {
      return undefined;
    }
  }

  /** Populate the catalog cache once per session, then refresh so a newly-cached
   *  match can appear. No-op when the catalog port can't warm. */
  private warmCatalogOnce(): void {
    if (this.catalogWarmStarted || !this.catalog?.warm) { return; }
    this.catalogWarmStarted = true;
    void this.catalog.warm()
      .then(() => this.refresh(vscode.window.activeTextEditor?.document))
      .catch(() => { /* warming is best-effort */ });
  }

  // ---------------------------------------------------------------------------
  // Bind command
  // ---------------------------------------------------------------------------

  async bindToCurrentFile(fileUri?: vscode.Uri) {
    let doc: vscode.TextDocument | undefined;
    if (fileUri) {
      try { doc = await vscode.workspace.openTextDocument(fileUri); } catch { /* fall through */ }
    }
    doc ??= vscode.window.activeTextEditor?.document;

    if (!doc || !isSupported(doc.languageId)) {
      vscode.window.showInformationMessage('Open a JSON or YAML file to bind a schema.');
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const docIsYaml = isYaml(doc.languageId);
    const docIsToml = isToml(doc.languageId);
    const current = findBoundSchemaPath(doc);
    const currentInline = extractInlineSchemaUrl(doc);
    // JSONL has no standardised $schema mechanism (F10-FR-02) — every other
    // supported format can carry an inline binding.
    const inlineSupported = doc.languageId !== 'jsonl';

    type Item = vscode.QuickPickItem & {
      uri?: vscode.Uri; isUrl?: true; isBrowse?: true; isRemove?: true; isCatalog?: true;
    };

    const urlItem: Item = {
      label: '$(globe) Enter URL...',
      description: 'Paste a schema URL (e.g. from SchemaStore)',
      isUrl: true,
    };
    const catalogItem: Item = {
      label: '$(book) Browse catalog...',
      description: 'Search SchemaStore and configured private catalogs',
      isCatalog: true,
    };
    const browseItem: Item = {
      label: '$(folder-opened) Browse file system...',
      description: 'Pick a schema file from anywhere on your computer',
      isBrowse: true,
    };
    const removeItem: Item = {
      label: '$(trash) Remove binding',
      description: currentInline
        ? `currently (inline): ${currentInline}`
        : current ? `currently: ${current}` : 'no binding set',
      isRemove: true,
    };

    const schemaItems = await this.findWorkspaceSchemas();
    const items: Item[] = this.catalog ? [urlItem, catalogItem, browseItem] : [urlItem, browseItem];

    if (schemaItems.length) {
      items.push({ label: 'Workspace schemas', kind: vscode.QuickPickItemKind.Separator } as Item);
      items.push(...schemaItems);
    }

    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator } as Item);
    items.push(removeItem);

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: `Bind schema to ${vscode.workspace.asRelativePath(doc.uri)}`,
      matchOnDescription: true,
    });
    if (!pick) {return;}

    if (pick.isRemove) {
      // Only offer to remove the inline form when there is actually one to remove
      // (F10-FR-03) — offering a destructive no-op is confusing.
      const target = await this.pickScope(folder !== undefined, {
        forRemove: true,
        allowInline: inlineSupported && currentInline !== undefined,
        tomlInlineOnly: docIsToml,
      });
      if (target === undefined) {return;}
      if (target === INLINE_SCOPE) {
        await this.removeInlineBinding(doc);
        this.refresh(doc);
        return;
      }
      const rmRelFile = relFileForTarget(doc.uri, target);
      await this.removePermBinding(rmRelFile, docIsYaml, folder, target);
      this.refresh(doc);
      return;
    }

    // Resolve the schema reference. URLs are already final; local files are
    // resolved to a path once the target scope is known (F10-FR-05, and see
    // resolveLocalSchemaRef for why Workspace/Global scope need special care).
    let schemaRef: string | undefined;
    let localSchemaUri: vscode.Uri | undefined;

    if (pick.isUrl) {
      const url = await vscode.window.showInputBox({
        title: 'JSON Schema URL',
        placeHolder: 'https://json.schemastore.org/package.json',
        prompt: 'Enter the URL or file path of the JSON Schema',
        validateInput: validateSchemaRefInput,
      });
      if (!url) {return;}
      schemaRef = url.trim();

      // GitHub raw URLs from the "Raw" button embed a short-lived ?token= query
      // parameter. Strip it before storing — it expires quickly, would be exposed
      // in settings files (and potentially committed to the repo), and is redundant
      // once proper OAuth credentials are configured via this extension.
      const stripped = stripEmbeddedUrlToken(schemaRef);
      if (stripped !== schemaRef) {
        schemaRef = stripped;
        vscode.window.showWarningMessage(
          'Embedded GitHub token stripped from URL — it would expire and be exposed in settings. ' +
          'Configure secure authentication so the schema can still be fetched.',
          'Configure Auth',
        ).then(action => {
          if (action === 'Configure Auth') {
            vscode.commands.executeCommand('jsonschema.configureSchemaAuth', schemaRef);
          }
        });
      }
    } else if (pick.isCatalog) {
      // F12: catalog only supplies the URL; scope handling below is unchanged.
      const fileName = vscode.workspace.asRelativePath(doc.uri, false);
      const url = await this.catalog!.browse(fileName);
      if (!url) {return;}
      schemaRef = url.trim();
    } else if (pick.isBrowse) {
      const defaultUri = folder?.uri ?? vscode.Uri.file(path.dirname(doc.uri.fsPath));
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: false,
        filters: { 'JSON Schema': ['json', 'yaml', 'yml'] },
        title: 'Select JSON Schema file',
        openLabel: 'Bind Schema',
        defaultUri,
      });
      if (!uris?.length) {return;}
      localSchemaUri = uris[0];
    } else {
      localSchemaUri = pick.uri!;
    }

    const target = await this.pickScope(folder !== undefined, {
      allowInline: inlineSupported,
      tomlInlineOnly: docIsToml,
    });
    if (target === undefined) {return;}

    if (target === vscode.ConfigurationTarget.Workspace && !folder) {
      vscode.window.showErrorMessage('File must be inside a workspace folder to use workspace settings.');
      return;
    }

    if (localSchemaUri) {
      schemaRef = this.resolveLocalSchemaRef(localSchemaUri, target, folder);
    }

    if (target === INLINE_SCOPE) {
      await this.writeInlineBinding(doc, schemaRef!);
      this.refresh(doc);
      return;
    }

    const relFile = relFileForTarget(doc.uri, target);
    await this.addPermBinding(relFile, schemaRef!, docIsYaml, folder, target);
    this.refresh(doc);
  }

  // ---------------------------------------------------------------------------
  // Local-cache redirection
  // ---------------------------------------------------------------------------

  /**
   * Points the `json.schemas` / `yaml.schemas` binding for `doc` at a locally
   * cached schema copy (`localPath`) instead of the protected remote URL, so the
   * language server reads the local file. Replaces any existing entry for the file.
   */
  async redirectToLocalCache(localPath: string, doc: vscode.TextDocument): Promise<void> {
    const relFile = vscode.workspace.asRelativePath(doc.uri, false);
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const target = folder
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    const scopeUri = target === vscode.ConfigurationTarget.Workspace ? folder?.uri : undefined;
    // Both the VS Code JSON language server and the Red Hat YAML extension require a
    // proper file:// URI for local schema paths — bare absolute paths are not recognised
    // by the YAML extension and are less portable than the URI form.
    const localUri = vscode.Uri.file(localPath).toString();
    await this.writeAddBinding(relFile, localUri, isYaml(doc.languageId), scopeUri, target);
  }

  // ---------------------------------------------------------------------------
  // Local schema-reference resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves a locally-picked schema file to the string stored as the binding's
   * `url` / `$schema` value.
   *
   * A relative `./...` path is used for WorkspaceFolder and Inline scope, but
   * only when the schema lives in the *same* workspace folder as the document
   * being bound (F04-FR-13 / F10-FR-05): every consumer resolves the relative
   * reference against the *document's* folder — VS Code's language servers for
   * a folder-scoped `json.schemas` entry, and this extension's own validator
   * (`loadSchema` in ValidationManager). A path made relative to a different
   * workspace folder of a multi-root setup would silently resolve inside the
   * wrong project, so cross-folder picks store the absolute path instead.
   *
   * Workspace (.code-workspace) and Global (User) scope always get the
   * absolute path: relative `json.schemas` / `yaml.schemas` URLs are
   * documented as unreliable once the setting lives outside a single folder's
   * own .vscode/settings.json (see e.g. microsoft/vscode#156006, #181187), and
   * User settings have no workspace folder to resolve "./" against at all.
   */
  private resolveLocalSchemaRef(
    uri: vscode.Uri,
    target: BindingTarget,
    docFolder: vscode.WorkspaceFolder | undefined
  ): string {
    const schemaFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!schemaFolder || schemaFolder.uri.fsPath !== docFolder?.uri.fsPath) {return uri.fsPath;}
    if (target === vscode.ConfigurationTarget.WorkspaceFolder || target === INLINE_SCOPE) {
      return `./${vscode.workspace.asRelativePath(uri, false)}`;
    }
    return uri.fsPath;
  }

  // ---------------------------------------------------------------------------
  // Inline binding (F10)
  // ---------------------------------------------------------------------------

  /** Writes or replaces the file's own `$schema` field (F10-FR-04..F10-FR-09). */
  private async writeInlineBinding(doc: vscode.TextDocument, schemaRef: string): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage(
        'Inline $schema bindings write to the file itself, which is disabled in untrusted workspaces.'
      );
      return;
    }

    const text = doc.getText();
    let edits: JsoncEdit[];

    if (isYaml(doc.languageId)) {
      const yamlExtensionInstalled = vscode.extensions.getExtension('redhat.vscode-yaml') !== undefined;
      edits = [computeYamlSchemaUpsertEdit(text, schemaRef, yamlExtensionInstalled)];
    } else if (isToml(doc.languageId)) {
      edits = [computeTomlSchemaUpsertEdit(text, schemaRef)];
    } else {
      const result = computeJsonSchemaInsertEdits(text, schemaRef, this.formattingOptionsFor(doc));
      if ('error' in result) {
        vscode.window.showErrorMessage(result.error);
        return;
      }
      edits = result.edits;
    }

    if (!(await this.applyJsoncEdits(doc, edits))) {return;}

    // F10-FR-05: warn when the embedded reference had to fall back to an
    // absolute, machine-specific path (schema lives outside the data file's
    // workspace folder — including in another folder of a multi-root workspace).
    if (!/^https?:\/\//i.test(schemaRef) && path.isAbsolute(schemaRef)) {
      vscode.window.showInformationMessage(
        `Schema is outside this file's workspace folder, so the absolute path was embedded: ${schemaRef}\n` +
        'This makes the binding machine-specific and reduces portability.'
      );
    }
  }

  /** Removes the file's own `$schema` field, if present (F10-FR-10/11). */
  private async removeInlineBinding(doc: vscode.TextDocument): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage(
        'Inline $schema bindings write to the file itself, which is disabled in untrusted workspaces.'
      );
      return;
    }

    const text = doc.getText();
    let edits: JsoncEdit[];
    if (isYaml(doc.languageId)) {
      edits = [computeYamlSchemaRemoveEdit(text)].filter((e): e is JsoncEdit => e !== undefined);
    } else if (isToml(doc.languageId)) {
      edits = [computeTomlSchemaRemoveEdit(text)].filter((e): e is JsoncEdit => e !== undefined);
    } else {
      edits = computeJsonSchemaRemoveEdits(text, this.formattingOptionsFor(doc));
    }

    if (!edits.length) {return;} // nothing to remove
    await this.applyJsoncEdits(doc, edits);
  }

  private formattingOptionsFor(doc: vscode.TextDocument): FormattingOptions {
    const cfg = vscode.workspace.getConfiguration('editor', doc.uri);
    return {
      tabSize: cfg.get<number>('tabSize') ?? 2,
      insertSpaces: cfg.get<boolean>('insertSpaces') ?? true,
      eol: doc.getText().includes('\r\n') ? '\r\n' : '\n',
    };
  }

  /** Applies jsonc-parser-style offset/length edits to `doc` via a vscode.WorkspaceEdit
   *  so the change is undoable and shows as an unsaved edit (F10-NFR-01). */
  private async applyJsoncEdits(doc: vscode.TextDocument, edits: JsoncEdit[]): Promise<boolean> {
    if (!edits.length) {return true;}
    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const e of edits) {
      const start = doc.positionAt(e.offset);
      const end = doc.positionAt(e.offset + e.length);
      workspaceEdit.replace(
        doc.uri,
        new vscode.Range(start.line, start.character, end.line, end.character),
        e.content
      );
    }
    return vscode.workspace.applyEdit(workspaceEdit);
  }

  // ---------------------------------------------------------------------------
  // Scope picker
  // ---------------------------------------------------------------------------

  private async pickScope(
    hasFolder: boolean,
    opts: { forRemove?: boolean; allowInline?: boolean; tomlInlineOnly?: boolean } = {}
  ): Promise<BindingTarget | undefined> {
    const { forRemove = false, allowInline = false, tomlInlineOnly = false } = opts;
    type ScopeItem = vscode.QuickPickItem & { target: BindingTarget };

    // TOML has no settings-based binding mechanism, so the scope is always
    // inline. Still show the picker so the explanatory subtitle appears
    // (F11-FR-12).
    if (tomlInlineOnly) {
      const inlineItem: ScopeItem = {
        label: '$(file-symlink-file) Inline (this file)',
        description: '$schema key',
        target: INLINE_SCOPE,
      };
      const pick = await vscode.window.showQuickPick([inlineItem], {
        placeHolder: 'TOML binding is inline only — the $schema key is written into your file.',
      });
      return pick?.target;
    }

    const items: ScopeItem[] = [];

    if (allowInline) {
      items.push({
        label: '$(file-symlink-file) Inline (this file)',
        description: '$schema field',
        detail: forRemove
          ? 'Remove the $schema field written directly into this file'
          : 'Written directly into this file as a $schema field — portable to other editors and tools',
        target: INLINE_SCOPE,
      });
    }

    if (hasFolder) {
      items.push({
        label: '$(file-directory) Local project',
        description: '.vscode/settings.json',
        detail: 'Saved in this folder\'s .vscode/settings.json — scoped to this project',
        target: vscode.ConfigurationTarget.WorkspaceFolder,
      });

      // Workspace scope only makes sense when a .code-workspace file is active
      const wsFile = vscode.workspace.workspaceFile;
      if (wsFile) {
        items.push({
          label: '$(root-folder) Workspace',
          description: path.basename(wsFile.fsPath),
          detail: `Saved in ${path.basename(wsFile.fsPath)} — applies to all folders in this workspace`,
          target: vscode.ConfigurationTarget.Workspace,
        });
      }
    }

    items.push({
      label: '$(person) User',
      description: '~/.vscode/settings.json',
      detail: 'Saved in your global user settings — applies to all workspaces on this machine',
      target: vscode.ConfigurationTarget.Global,
    });

    if (items.length === 1) {return items[0].target;}

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: forRemove
        ? 'Remove binding from which settings?'
        : 'Where should this binding be saved?',
    });
    return pick?.target;
  }

  // ---------------------------------------------------------------------------
  // Schema discovery
  // ---------------------------------------------------------------------------

  private async findWorkspaceSchemas() {
    const uris = await vscode.workspace.findFiles(
      '**/*.{json,yaml,yml}',
      '{**/node_modules/**,**/dist/**,**/.git/**}',
      500
    );

    type Item = vscode.QuickPickItem & { uri: vscode.Uri };
    // Read candidates concurrently and off the main thread so a large workspace
    // does not block the extension host (VS Code guidance favours async fs).
    const results = await Promise.all(uris.map(async (uri): Promise<Item | undefined> => {
      try {
        const raw = await fs.promises.readFile(uri.fsPath, 'utf-8');
        const isSchema = /"?\$schema"?\s*:/.test(raw) || /^\$schema\s*:/m.test(raw);
        if (!isSchema) {return undefined;}
        return {
          label: `$(file-code) ${path.basename(uri.fsPath)}`,
          description: vscode.workspace.asRelativePath(uri),
          uri,
        };
      } catch {
        return undefined; // unreadable — skip
      }
    }));
    return results.filter((i): i is Item => i !== undefined);
  }

  // ---------------------------------------------------------------------------
  // Persistent binding helpers
  // ---------------------------------------------------------------------------

  private async addPermBinding(
    relFile: string,
    schemaRef: string,
    isYaml: boolean,
    folder: vscode.WorkspaceFolder | undefined,
    target: vscode.ConfigurationTarget
  ) {
    const scopeUri = target !== vscode.ConfigurationTarget.Global ? folder?.uri : undefined;
    await this.writeAddBinding(relFile, schemaRef, isYaml, scopeUri, target);

    // The generate commands need the schema itself: resolve the stored ref
    // (which may be `./relative` to the workspace folder) to an absolute
    // path; URLs pass through unchanged (F16-FR-01, F18-FR-01).
    const schemaAbs = /^https?:\/\//i.test(schemaRef)
      ? schemaRef
      : path.resolve(folder?.uri.fsPath ?? '', schemaRef);
    const action = await vscode.window.showInformationMessage(
      `Schema bound: ${path.basename(schemaRef)} → ${path.basename(relFile)}. Generate sample file?`,
      'Generate Sample',
      'Generate Types',
      'Open Settings'
    );
    if (action === 'Generate Sample') {
      await vscode.commands.executeCommand('jsonschema.generateSampleData', schemaAbs);
    } else if (action === 'Generate Types') {
      await vscode.commands.executeCommand('jsonschema.generateTypes', schemaAbs);
    } else if (action === 'Open Settings') {
      await vscode.commands.executeCommand(
        target === vscode.ConfigurationTarget.Global
          ? 'workbench.action.openSettingsJson'
          : 'workbench.action.openWorkspaceSettingsFile'
      );
    }
  }

  private async removePermBinding(
    relFile: string,
    isYaml: boolean,
    folder: vscode.WorkspaceFolder | undefined,
    target: vscode.ConfigurationTarget
  ) {
    const scopeUri = target !== vscode.ConfigurationTarget.Global ? folder?.uri : undefined;
    await this.writeRemoveBinding(relFile, isYaml, scopeUri, target);

    const action = await vscode.window.showInformationMessage(
      `Schema binding removed from ${path.basename(relFile)}`,
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand(
        target === vscode.ConfigurationTarget.Global
          ? 'workbench.action.openSettingsJson'
          : 'workbench.action.openWorkspaceSettingsFile'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Low-level settings writers
  // ---------------------------------------------------------------------------

  private async writeAddBinding(
    relFile: string,
    schemaRef: string,
    isYaml: boolean,
    scopeUri: vscode.Uri | undefined,
    target: vscode.ConfigurationTarget
  ) {
    if (isYaml) {
      const cfg = vscode.workspace.getConfiguration('yaml', scopeUri);
      const inspect = cfg.inspect<Record<string, string | string[]>>('schemas');
      const schemas = { ...pickInspectValue(inspect, target) ?? {} };
      for (const key of Object.keys(schemas)) {
        const dropped = dropPattern(schemas[key], relFile);
        if (!dropped) {delete schemas[key];}
        else {schemas[key] = dropped;}
      }
      schemas[schemaRef] = relFile;
      await cfg.update('schemas', schemas, target);
    } else {
      const cfg = vscode.workspace.getConfiguration('json', scopeUri);
      const inspect = cfg.inspect<any[]>('schemas');
      const schemas = (pickInspectValue(inspect, target) ?? []).filter(
        s => !matchesFile(s.fileMatch ?? [], relFile)
      );
      schemas.push({ url: schemaRef, fileMatch: [relFile] });
      await cfg.update('schemas', schemas, target);
    }
  }

  private async writeRemoveBinding(
    relFile: string,
    isYaml: boolean,
    scopeUri: vscode.Uri | undefined,
    target: vscode.ConfigurationTarget
  ) {
    if (isYaml) {
      const cfg = vscode.workspace.getConfiguration('yaml', scopeUri);
      const inspect = cfg.inspect<Record<string, string | string[]>>('schemas');
      const schemas = { ...pickInspectValue(inspect, target) ?? {} };
      for (const key of Object.keys(schemas)) {
        const dropped = dropPattern(schemas[key], relFile);
        if (!dropped) {delete schemas[key];}
        else {schemas[key] = dropped;}
      }
      await cfg.update('schemas', Object.keys(schemas).length ? schemas : undefined, target);
    } else {
      const cfg = vscode.workspace.getConfiguration('json', scopeUri);
      const inspect = cfg.inspect<any[]>('schemas');
      const schemas = (pickInspectValue(inspect, target) ?? []).filter(
        s => !matchesFile(s.fileMatch ?? [], relFile)
      );
      await cfg.update('schemas', schemas.length ? schemas : undefined, target);
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// Shared between extractInlineSchemaUrl (read) and the inline-write helpers
// below (write) so detection and writing always agree on notation.
const YAML_DIRECTIVE_RE = /^#\s*yaml-language-server:\s*\$schema=(\S+)/im;
const YAML_KEY_RE = /^\$schema:\s*(\S+)/m;
// TOML inline `$schema` key (F11-FR-15). TOML requires the quoted-key form
// because `$` is not a bare-key character.
const TOML_SCHEMA_KEY_RE = /^"\$schema"\s*=\s*"([^"]+)"/m;
// A `[table]` or `[[array-of-table]]` header line — everything from here on
// belongs to that table, not the document root (F11-FR-15/16/17).
const TOML_TABLE_HEADER_RE = /^[ \t]*\[\[?[^\]\r\n]+\]?\][ \t]*(#.*)?$/m;

/**
 * The text preceding the first `[table]`/`[[array-of-table]]` header — the
 * document's root table, and the only place a document-level `"$schema"`
 * binding can live. A `"$schema"` key found after a header belongs to that
 * table (e.g. `tool.foo."$schema"`), not the document's own binding.
 */
function tomlRootTableText(text: string): string {
  const header = TOML_TABLE_HEADER_RE.exec(text);
  return header ? text.slice(0, header.index) : text;
}

/** Escapes a value for embedding in a TOML basic string ("..."). TOML basic
 *  strings share JSON's core escape sequences (`\\`, `\"`, `\uXXXX`-escaped
 *  control characters), so this reuses JSON's escaper instead of hand-rolling
 *  a second one — important because an un-escaped Windows path's backslashes
 *  (e.g. `C:\Users\...`) would otherwise be read back as TOML escape
 *  sequences, and an invalid one (`\U` not followed by 8 hex digits) makes
 *  the whole file fail to parse (F11-FR-16). */
function escapeTomlBasicString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/** Reverses {@link escapeTomlBasicString} (F11-FR-15). */
function unescapeTomlBasicString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

/**
 * Returns the schema URL/path bound to this document via any settings scope,
 * or undefined if none. Exported for use by ValidationManager.
 *
 * Resolves the same way VS Code itself does (F04-FR-14): scoped to the
 * document's own resource, so a WorkspaceFolder-scoped entry from a
 * *different* folder is excluded, but checked against every scope that can
 * hold a binding (Global, Workspace, WorkspaceFolder) rather than only
 * whichever `get()` happens to consider "effective" — a workspace can have
 * bindings for different files written at different scopes at once. Matching
 * tries both path forms a binding can be stored in, since which form applies
 * depends on which scope wrote the entry, not on which scope is being read.
 */
export function findBoundSchemaPath(doc: vscode.TextDocument): string | undefined {
  const relFolder = relFileForTarget(doc.uri, vscode.ConfigurationTarget.WorkspaceFolder);
  const relWorkspace = relFileForTarget(doc.uri, vscode.ConfigurationTarget.Workspace);
  const candidates = relFolder === relWorkspace ? [relFolder] : [relFolder, relWorkspace];

  const jsonInspect = vscode.workspace.getConfiguration('json', doc.uri).inspect<any[]>('schemas');
  const jsonSchemas = [
    ...(jsonInspect?.globalValue ?? []),
    ...(jsonInspect?.workspaceValue ?? []),
    ...(jsonInspect?.workspaceFolderValue ?? []),
  ];
  for (const entry of jsonSchemas) {
    const patterns: string[] = entry.fileMatch ?? [];
    if (candidates.some(rel => matchesFile(patterns, rel))) {return entry.url as string;}
  }

  const yamlInspect = vscode.workspace.getConfiguration('yaml', doc.uri)
    .inspect<Record<string, string | string[]>>('schemas');
  const yamlSchemas: Record<string, string | string[]> = {
    ...(yamlInspect?.globalValue ?? {}),
    ...(yamlInspect?.workspaceValue ?? {}),
    ...(yamlInspect?.workspaceFolderValue ?? {}),
  };
  for (const [schemaPath, patterns] of Object.entries(yamlSchemas)) {
    const arr = Array.isArray(patterns) ? patterns : [patterns];
    if (arr.some(p => candidates.some(rel => normalise(p) === normalise(rel)))) {return schemaPath;}
  }

  return undefined;
}

/**
 * Validates a user-entered schema reference for the bind-by-URL flow: it must be
 * a non-empty http(s) URL or a relative (`./`) or absolute file path. Returns an
 * error message for the input box, or undefined when the input is acceptable.
 */
export function validateSchemaRefInput(v: string | undefined): string | undefined {
  if (!v?.trim()) { return 'Required'; }
  if (
    !v.startsWith('http://') &&
    !v.startsWith('https://') &&
    !v.startsWith('./') &&
    !path.isAbsolute(v)
  ) {
    return 'Enter an http/https URL or a relative/absolute file path';
  }
  return undefined;
}

/**
 * Removes an embedded `?token=` query parameter from GitHub raw content URLs.
 * GitHub appends these when you copy the URL from the "Raw" button on a private
 * repo. They are short-lived, expose credentials in plain text, and are redundant
 * once the extension's OAuth auth flow is used instead.
 */
export function stripEmbeddedUrlToken(url: string): string {
  try {
    const u = new URL(url);
    const isGitHub = u.hostname === 'github.com'
      || u.hostname.endsWith('.github.com')
      || u.hostname.endsWith('.githubusercontent.com');
    if (isGitHub && u.searchParams.has('token')) {
      u.searchParams.delete('token');
      return u.toString();
    }
  } catch { /* not a parseable URL — leave as-is */ }
  return url;
}

/** Strip leading ./ so that "./foo.json" and "foo.json" compare equal. */
export function normalise(p: string): string {
  return p.startsWith('./') ? p.slice(2) : p;
}

export function matchesFile(patterns: string[], relFile: string): boolean {
  return patterns.some(p => normalise(p) === normalise(relFile));
}

/** Remove a file pattern from a single-value or array value; returns undefined if empty. */
export function dropPattern(
  patterns: string | string[],
  relFile: string
): string | string[] | undefined {
  const arr = Array.isArray(patterns) ? patterns : [patterns];
  const kept = arr.filter(p => normalise(p) !== normalise(relFile));
  if (!kept.length) {return undefined;}
  return kept.length === 1 ? kept[0] : kept;
}

/**
 * Computes the `fileMatch` path for a document URI given the chosen binding target.
 *
 * - WorkspaceFolder / Global → folder-relative path (no folder-name prefix)
 * - Workspace in a multi-root setup → workspace-root-relative path (includes folder prefix)
 *   so the pattern is unambiguous when stored in the .code-workspace file.
 */
export function relFileForTarget(uri: vscode.Uri, target: vscode.ConfigurationTarget): string {
  if (target === vscode.ConfigurationTarget.Workspace) {
    const isMultiRoot = vscode.workspace.workspaceFile !== undefined
      && (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    return vscode.workspace.asRelativePath(uri, isMultiRoot);
  }
  return vscode.workspace.asRelativePath(uri, false);
}

/**
 * Reads the right inspect value for a given configuration target so that
 * writeAddBinding / writeRemoveBinding operate on the correct settings layer.
 */
export function pickInspectValue<T>(
  inspect: { workspaceValue?: T; globalValue?: T; workspaceFolderValue?: T } | undefined,
  target: vscode.ConfigurationTarget
): T | undefined {
  if (target === vscode.ConfigurationTarget.WorkspaceFolder) {return inspect?.workspaceFolderValue;}
  if (target === vscode.ConfigurationTarget.Workspace)       {return inspect?.workspaceValue;}
  return inspect?.globalValue;
}

/**
 * Reads the inline `$schema` value from the document's own content —
 * either the JSON `"$schema"` property or a YAML `$schema:` / directive.
 * Returns undefined when the document cannot be parsed or has no schema field.
 * Exported for use by ValidationManager and SchemaAuthStatusBar.
 */
export function extractInlineSchemaUrl(doc: vscode.TextDocument): string | undefined {
  try {
    if (isYaml(doc.languageId)) {
      const text = doc.getText();
      // yaml-language-server directive comment — value may be a URL or a local
      // relative/absolute path (F10 inline bindings can embed either).
      const directive = YAML_DIRECTIVE_RE.exec(text);
      if (directive) { return directive[1]; }
      // top-level $schema key
      const inline = YAML_KEY_RE.exec(text);
      return inline?.[1];
    }
    if (isToml(doc.languageId)) {
      // Lightweight regex rather than full TOML parsing, matching how YAML
      // inline extraction works, restricted to the root table (F11-FR-15).
      const inline = TOML_SCHEMA_KEY_RE.exec(tomlRootTableText(doc.getText()));
      return inline ? unescapeTomlBasicString(inline[1]) : undefined;
    }
    const text = doc.languageId === 'jsonc' ? stripJsoncComments(doc.getText()) : doc.getText();
    const parsed = JSON.parse(text);
    const s = (parsed as Record<string, unknown>).$schema;
    return typeof s === 'string' ? s : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Inline binding — pure text-edit computation (F10)
//
// These return jsonc-parser-style {offset, length, content} edits rather than
// mutating anything themselves, so they're plain string→data functions that
// don't need a vscode.TextDocument or any VS Code API to test.
// ---------------------------------------------------------------------------

/** Result of computing the edits to insert/replace an inline JSON `$schema`. */
export type JsonInlineWriteResult = { edits: JsoncEdit[] } | { error: string };

/**
 * Computes the edits needed to insert (as the first key) or replace the
 * JSON/JSONC `"$schema"` property. Returns an `error` instead when the root
 * of the document is not a JSON object (F10-FR-06).
 */
export function computeJsonSchemaInsertEdits(
  text: string,
  schemaRef: string,
  formattingOptions: FormattingOptions
): JsonInlineWriteResult {
  const tree = parseTree(text);
  if (!tree || tree.type !== 'object') {
    return { error: 'The active file must contain a JSON object at the root to add an inline $schema.' };
  }
  const edits = modify(text, ['$schema'], schemaRef, {
    formattingOptions,
    getInsertionIndex: () => 0,
  });
  return { edits };
}

/**
 * Computes the edits needed to remove the JSON/JSONC `"$schema"` property.
 * jsonc-parser's `modify()` also removes the now-dangling comma either side
 * of the property (F10-FR-11). Returns an empty array when there is nothing
 * to remove.
 */
export function computeJsonSchemaRemoveEdits(
  text: string,
  formattingOptions: FormattingOptions
): JsoncEdit[] {
  const tree = parseTree(text);
  if (!tree || tree.type !== 'object') {return [];}
  return modify(text, ['$schema'], undefined, { formattingOptions });
}

/**
 * Computes the single edit needed to write an inline YAML schema reference,
 * following the priority order in F10-FR-09: update an existing directive or
 * plain key in place; otherwise insert a fresh first line, choosing the
 * directive form when the redhat.vscode-yaml extension is installed and a
 * plain `$schema:` key otherwise.
 */
export function computeYamlSchemaUpsertEdit(
  text: string,
  schemaRef: string,
  yamlExtensionInstalled: boolean
): JsoncEdit {
  const directive = YAML_DIRECTIVE_RE.exec(text);
  if (directive) {
    const valueOffset = directive.index + directive[0].lastIndexOf(directive[1]);
    return { offset: valueOffset, length: directive[1].length, content: schemaRef };
  }
  const key = YAML_KEY_RE.exec(text);
  if (key) {
    const valueOffset = key.index + key[0].lastIndexOf(key[1]);
    return { offset: valueOffset, length: key[1].length, content: schemaRef };
  }
  const line = yamlExtensionInstalled
    ? `# yaml-language-server: $schema=${schemaRef}\n`
    : `$schema: ${schemaRef}\n`;
  return { offset: 0, length: 0, content: line };
}

/**
 * Computes the edit needed to remove an inline YAML schema reference —
 * either the whole directive-comment line or the whole `$schema:` key line,
 * including its trailing newline. Returns undefined when neither form is
 * present (F10-FR-10).
 */
export function computeYamlSchemaRemoveEdit(text: string): JsoncEdit | undefined {
  const directiveLine = /^#\s*yaml-language-server:\s*\$schema=\S+\r?\n?/im.exec(text);
  if (directiveLine) {return { offset: directiveLine.index, length: directiveLine[0].length, content: '' };}
  const keyLine = /^\$schema:\s*\S+\r?\n?/m.exec(text);
  if (keyLine) {return { offset: keyLine.index, length: keyLine[0].length, content: '' };}
  return undefined;
}

// ---------------------------------------------------------------------------
// Inline binding — TOML (F11-FR-16/17)
//
// TOML has no built-in schema-binding mechanism, so the inline `"$schema"` key
// is the sole binding form. `$` is not a bare-key character, so the key is
// written in the quoted-key form: `"$schema" = "<ref>"`.
// ---------------------------------------------------------------------------

/**
 * Computes the single edit needed to write an inline TOML schema reference:
 * replace an existing `"$schema" = "<ref>"` value in place, or insert a fresh
 * `"$schema" = "<ref>"` line before the first non-comment, non-blank line so it
 * sits above any `[table]` header (TOML requires top-level keys to precede
 * table sections). (F11-FR-16)
 */
export function computeTomlSchemaUpsertEdit(text: string, schemaRef: string): JsoncEdit {
  const escapedRef = escapeTomlBasicString(schemaRef);
  // Restricted to the root table so a nested `"$schema"` key under a
  // `[table]` header isn't mistaken for the document's own binding (F11-FR-15).
  const existing = TOML_SCHEMA_KEY_RE.exec(tomlRootTableText(text));
  if (existing) {
    // Replace just the quoted value, preserving surrounding whitespace.
    const valueOffset = existing.index + existing[0].lastIndexOf(existing[1]);
    return { offset: valueOffset, length: existing[1].length, content: escapedRef };
  }

  // Find the first line that is neither blank nor a `#` comment.
  const lines = text.split('\n');
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== '' && !trimmed.startsWith('#')) { break; }
    offset += line.length + 1; // + newline
  }
  if (offset > text.length) { offset = text.length; }
  return { offset, length: 0, content: `"$schema" = "${escapedRef}"\n` };
}

/**
 * Computes the edit needed to remove an inline TOML schema reference — the whole
 * `"$schema" = "..."` line including its trailing newline. Returns undefined
 * when no such line is present (F11-FR-17).
 */
export function computeTomlSchemaRemoveEdit(text: string): JsoncEdit | undefined {
  // Restricted to the root table, mirroring computeTomlSchemaUpsertEdit (F11-FR-15/17).
  const rootText = tomlRootTableText(text);
  const line = /^"\$schema"\s*=\s*"[^"]*"[^\n]*\r?\n?/m.exec(rootText);
  if (line) {return { offset: line.index, length: line[0].length, content: '' };}
  return undefined;
}
