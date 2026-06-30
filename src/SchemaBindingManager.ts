import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { isSupported, isYaml, stripJsoncComments } from './languages';

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

  constructor(context: vscode.ExtensionContext) {
    this.ctx = context;
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
    if (!temps.length) return;

    const now = Date.now();
    const deferred: TempBindingRecord[] = [];

    for (const record of temps) {
      if (record.addedAt !== undefined && now - record.addedAt > TEMP_EXPIRY_MS) continue;

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
    const binding = findBoundSchemaPath(doc);
    if (binding) {
      this.statusBar.text = `$(check) Schema: ${path.basename(binding)}`;
      this.statusBar.tooltip = `Schema bound: ${binding}\nClick to change or remove`;
    } else {
      this.statusBar.text = `$(circle-slash) Schema: unbound`;
      this.statusBar.tooltip = 'No JSON Schema bound to this file\nClick to bind one';
    }
    this.statusBar.show();
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
    const current = findBoundSchemaPath(doc);

    type Item = vscode.QuickPickItem & { uri?: vscode.Uri; isUrl?: true; isBrowse?: true; isRemove?: true };

    const urlItem: Item = {
      label: '$(globe) Enter URL...',
      description: 'Paste a schema URL (e.g. from SchemaStore)',
      isUrl: true,
    };
    const browseItem: Item = {
      label: '$(folder-opened) Browse file system...',
      description: 'Pick a schema file from anywhere on your computer',
      isBrowse: true,
    };
    const removeItem: Item = {
      label: '$(trash) Remove binding',
      description: current ? `currently: ${current}` : 'no binding set',
      isRemove: true,
    };

    const schemaItems = await this.findWorkspaceSchemas();
    const items: Item[] = [urlItem, browseItem];

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
    if (!pick) return;

    if (pick.isRemove) {
      const target = await this.pickScope(folder !== undefined, true);
      if (target === undefined) return;
      const rmRelFile = relFileForTarget(doc.uri, target);
      await this.removePermBinding(rmRelFile, docIsYaml, folder, target);
      this.refresh(doc);
      return;
    }

    // Resolve schema reference before asking for scope
    let schemaRef: string | undefined;

    if (pick.isUrl) {
      const url = await vscode.window.showInputBox({
        title: 'JSON Schema URL',
        placeHolder: 'https://json.schemastore.org/package.json',
        prompt: 'Enter the URL or file path of the JSON Schema',
        validateInput: v => {
          if (!v?.trim()) return 'Required';
          if (
            !v.startsWith('http://') &&
            !v.startsWith('https://') &&
            !v.startsWith('./') &&
            !path.isAbsolute(v)
          ) {
            return 'Enter an http/https URL or a relative/absolute file path';
          }
          return undefined;
        },
      });
      if (!url) return;
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
      if (!uris?.length) return;
      const picked = uris[0];
      const inWorkspace = vscode.workspace.getWorkspaceFolder(picked);
      schemaRef = inWorkspace
        ? `./${vscode.workspace.asRelativePath(picked, false)}`
        : picked.fsPath;
    } else {
      schemaRef = `./${vscode.workspace.asRelativePath(pick.uri!, false)}`;
    }

    const target = await this.pickScope(folder !== undefined);
    if (target === undefined) return;

    if (target === vscode.ConfigurationTarget.Workspace && !folder) {
      vscode.window.showErrorMessage('File must be inside a workspace folder to use workspace settings.');
      return;
    }

    const relFile = relFileForTarget(doc.uri, target);
    await this.addPermBinding(relFile, schemaRef, docIsYaml, folder, target);
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
  // Scope picker
  // ---------------------------------------------------------------------------

  private async pickScope(
    hasFolder: boolean,
    forRemove = false
  ): Promise<vscode.ConfigurationTarget | undefined> {
    type ScopeItem = vscode.QuickPickItem & { target: vscode.ConfigurationTarget };

    const items: ScopeItem[] = [];

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

    if (items.length === 1) return items[0].target;

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
        if (!isSchema) return undefined;
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

    const action = await vscode.window.showInformationMessage(
      `Schema bound: ${path.basename(schemaRef)} → ${path.basename(relFile)}`,
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
        if (!dropped) delete schemas[key];
        else schemas[key] = dropped;
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
        if (!dropped) delete schemas[key];
        else schemas[key] = dropped;
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

/**
 * Returns the schema URL/path bound to this document via any settings scope,
 * or undefined if none. Exported for use by ValidationManager.
 */
export function findBoundSchemaPath(doc: vscode.TextDocument): string | undefined {
  const rel = vscode.workspace.asRelativePath(doc.uri, false);

  const jsonSchemas = vscode.workspace.getConfiguration('json').get<any[]>('schemas') ?? [];
  for (const entry of jsonSchemas) {
    if (matchesFile(entry.fileMatch ?? [], rel)) return entry.url as string;
  }

  const yamlSchemas =
    vscode.workspace.getConfiguration('yaml').get<Record<string, string | string[]>>('schemas') ?? {};
  for (const [schemaPath, patterns] of Object.entries(yamlSchemas)) {
    const arr = Array.isArray(patterns) ? patterns : [patterns];
    if (arr.some(p => normalise(p) === normalise(rel))) return schemaPath;
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
  if (!kept.length) return undefined;
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
  if (target === vscode.ConfigurationTarget.WorkspaceFolder) return inspect?.workspaceFolderValue;
  if (target === vscode.ConfigurationTarget.Workspace)       return inspect?.workspaceValue;
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
      // yaml-language-server directive comment
      const directive = /yaml-language-server[^$]*\$schema=(https?:\/\/\S+)/i.exec(text);
      if (directive) { return directive[1]; }
      // top-level $schema key
      const inline = /^\$schema:\s*(\S+)/m.exec(text);
      return inline?.[1];
    }
    const text = doc.languageId === 'jsonc' ? stripJsoncComments(doc.getText()) : doc.getText();
    const parsed = JSON.parse(text);
    const s = (parsed as Record<string, unknown>).$schema;
    return typeof s === 'string' ? s : undefined;
  } catch {
    return undefined;
  }
}
