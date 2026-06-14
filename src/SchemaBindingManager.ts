import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { isSupported, isYaml, stripJsoncComments } from './languages';

type BindTarget = vscode.ConfigurationTarget | 'session';

const TEMP_KEY = 'jsonschema.temporaryBindings';

interface TempBindingRecord {
  relFile: string;
  schemaRef: string;
  isYaml: boolean;
  folderUri: string;
}

/**
 * Manages the status bar item and settings bindings that link JSON/YAML data
 * files to JSON Schema files for validation. Supports workspace and user scope,
 * local file paths, remote URLs, and session-only (temporary) bindings.
 */
export class SchemaBindingManager {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly ctx: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.ctx = context;
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 2);
    this.statusBar.command = 'jsonschema.bindToCurrentFile';
    context.subscriptions.push(this.statusBar);

    // Remove any temporary bindings left over from the previous session
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
  // Temporary binding lifecycle
  // ---------------------------------------------------------------------------

  async cleanupTemporaryBindings() {
    const temps = this.ctx.workspaceState.get<TempBindingRecord[]>(TEMP_KEY, []);
    if (!temps.length) return;

    for (const { relFile, schemaRef, isYaml, folderUri } of temps) {
      const folder = vscode.workspace.workspaceFolders?.find(f => f.uri.toString() === folderUri);
      if (!folder) continue;
      await this.writeRemoveBinding(relFile, isYaml, folder.uri, vscode.ConfigurationTarget.Workspace);
    }

    await this.ctx.workspaceState.update(TEMP_KEY, []);
  }

  private isTemporaryBinding(relFile: string): boolean {
    return this.ctx.workspaceState
      .get<TempBindingRecord[]>(TEMP_KEY, [])
      .some(t => normalise(t.relFile) === normalise(relFile));
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
      const isTemp = this.isTemporaryBinding(vscode.workspace.asRelativePath(doc.uri, false));
      this.statusBar.text = isTemp
        ? `$(watch) Schema: ${path.basename(binding)}`
        : `$(check) Schema: ${path.basename(binding)}`;
      this.statusBar.tooltip = isTemp
        ? `Temporary schema (session only): ${binding}\nClick to change or remove`
        : `Schema bound: ${binding}\nClick to change or remove`;
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
    const isYaml = ['yaml', 'yml'].includes(doc.languageId);
    const relFile = vscode.workspace.asRelativePath(doc.uri, false);
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

    // Remove: auto-detect whether it's a temporary binding and skip scope picker
    if (pick.isRemove) {
      if (this.isTemporaryBinding(relFile)) {
        await this.removeTempBinding(relFile, isYaml, folder);
      } else {
        const target = await this.pickScope(folder !== undefined, true);
        if (target === undefined) return;
        await this.removePermBinding(relFile, isYaml, folder, target as vscode.ConfigurationTarget);
      }
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

    if (target === 'session') {
      if (!folder) {
        vscode.window.showErrorMessage('Session bindings require an open workspace folder.');
        return;
      }
      await this.addTempBinding(relFile, schemaRef, isYaml, folder);
    } else {
      if (target === vscode.ConfigurationTarget.Workspace && !folder) {
        vscode.window.showErrorMessage('File must be inside a workspace folder to use workspace settings.');
        return;
      }
      await this.addPermBinding(relFile, schemaRef, isYaml, folder, target);
    }

    this.refresh(doc);
  }

  // ---------------------------------------------------------------------------
  // Scope picker
  // ---------------------------------------------------------------------------

  private async pickScope(hasFolder: boolean, forRemove = false): Promise<BindTarget | undefined> {
    type ScopeItem = vscode.QuickPickItem & { target: BindTarget };

    const items: ScopeItem[] = [];

    if (hasFolder && !forRemove) {
      items.push({
        label: '$(watch) Session only',
        description: 'temporary',
        detail: 'Active for this window only — not saved to any settings file',
        target: 'session',
      });
    }

    if (hasFolder) {
      items.push({
        label: '$(folder) Workspace',
        description: '.vscode/settings.json',
        detail: 'Project-specific — applies only to this workspace',
        target: vscode.ConfigurationTarget.Workspace,
      });
    }

    items.push({
      label: '$(person) User',
      description: 'User settings',
      detail: 'Applies to all your workspaces on this machine',
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
    const items: Item[] = [];
    for (const uri of uris) {
      try {
        const raw = fs.readFileSync(uri.fsPath, 'utf-8');
        const isSchema = /"?\$schema"?\s*:/.test(raw) || /^\$schema\s*:/m.test(raw);
        if (!isSchema) continue;
        items.push({
          label: `$(file-code) ${path.basename(uri.fsPath)}`,
          description: vscode.workspace.asRelativePath(uri),
          uri,
        });
      } catch {
        // unreadable — skip
      }
    }
    return items;
  }

  // ---------------------------------------------------------------------------
  // Temporary binding helpers
  // ---------------------------------------------------------------------------

  private async addTempBinding(
    relFile: string,
    schemaRef: string,
    isYaml: boolean,
    folder: vscode.WorkspaceFolder
  ) {
    await this.writeAddBinding(relFile, schemaRef, isYaml, folder.uri, vscode.ConfigurationTarget.Workspace);

    const temps = this.ctx.workspaceState.get<TempBindingRecord[]>(TEMP_KEY, []);
    const updated = temps.filter(t => normalise(t.relFile) !== normalise(relFile));
    updated.push({ relFile, schemaRef, isYaml, folderUri: folder.uri.toString() });
    await this.ctx.workspaceState.update(TEMP_KEY, updated);

    const action = await vscode.window.showInformationMessage(
      `Session schema: ${path.basename(schemaRef)} → ${path.basename(relFile)} (not saved)`,
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
    }
  }

  private async removeTempBinding(
    relFile: string,
    isYaml: boolean,
    folder: vscode.WorkspaceFolder | undefined
  ) {
    if (folder) {
      await this.writeRemoveBinding(relFile, isYaml, folder.uri, vscode.ConfigurationTarget.Workspace);
    }
    const temps = this.ctx.workspaceState.get<TempBindingRecord[]>(TEMP_KEY, []);
    await this.ctx.workspaceState.update(
      TEMP_KEY,
      temps.filter(t => normalise(t.relFile) !== normalise(relFile))
    );
    vscode.window.showInformationMessage(`Temporary binding removed from ${path.basename(relFile)}`);
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
    const scopeUri = target === vscode.ConfigurationTarget.Workspace ? folder?.uri : undefined;
    await this.writeAddBinding(relFile, schemaRef, isYaml, scopeUri, target);

    const action = await vscode.window.showInformationMessage(
      `Schema bound: ${path.basename(schemaRef)} → ${path.basename(relFile)}`,
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand(
        target === vscode.ConfigurationTarget.Workspace
          ? 'workbench.action.openWorkspaceSettingsFile'
          : 'workbench.action.openSettingsJson'
      );
    }
  }

  private async removePermBinding(
    relFile: string,
    isYaml: boolean,
    folder: vscode.WorkspaceFolder | undefined,
    target: vscode.ConfigurationTarget
  ) {
    const scopeUri = target === vscode.ConfigurationTarget.Workspace ? folder?.uri : undefined;
    await this.writeRemoveBinding(relFile, isYaml, scopeUri, target);

    const action = await vscode.window.showInformationMessage(
      `Schema binding removed from ${path.basename(relFile)}`,
      'Open Settings'
    );
    if (action === 'Open Settings') {
      await vscode.commands.executeCommand(
        target === vscode.ConfigurationTarget.Workspace
          ? 'workbench.action.openWorkspaceSettingsFile'
          : 'workbench.action.openSettingsJson'
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
    const isWs = target === vscode.ConfigurationTarget.Workspace;
    if (isYaml) {
      const cfg = vscode.workspace.getConfiguration('yaml', scopeUri);
      const inspect = cfg.inspect<Record<string, string | string[]>>('schemas');
      const schemas = { ...(isWs ? inspect?.workspaceValue : inspect?.globalValue) ?? {} };
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
      const source = (isWs ? inspect?.workspaceValue : inspect?.globalValue) ?? [];
      const schemas = source.filter(s => !matchesFile(s.fileMatch ?? [], relFile));
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
    const isWs = target === vscode.ConfigurationTarget.Workspace;
    if (isYaml) {
      const cfg = vscode.workspace.getConfiguration('yaml', scopeUri);
      const inspect = cfg.inspect<Record<string, string | string[]>>('schemas');
      const schemas = { ...(isWs ? inspect?.workspaceValue : inspect?.globalValue) ?? {} };
      for (const key of Object.keys(schemas)) {
        const dropped = dropPattern(schemas[key], relFile);
        if (!dropped) delete schemas[key];
        else schemas[key] = dropped;
      }
      await cfg.update('schemas', Object.keys(schemas).length ? schemas : undefined, target);
    } else {
      const cfg = vscode.workspace.getConfiguration('json', scopeUri);
      const inspect = cfg.inspect<any[]>('schemas');
      const source = (isWs ? inspect?.workspaceValue : inspect?.globalValue) ?? [];
      const schemas = source.filter(s => !matchesFile(s.fileMatch ?? [], relFile));
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
