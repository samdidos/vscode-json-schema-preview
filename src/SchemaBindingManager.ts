import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages the status bar item and workspace-settings bindings that link
 * JSON/YAML data files to local JSON Schema files for validation.
 *
 * Writes to json.schemas / yaml.schemas in .vscode/settings.json so that
 * VS Code's built-in JSON language server (and the YAML extension) picks
 * them up exactly as if the user had used the native schema picker — but
 * without being restricted to public schemas from SchemaStore.
 */
export class SchemaBindingManager {
  private readonly statusBar: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 2);
    this.statusBar.command = 'jsonschema.bindToCurrentFile';
    context.subscriptions.push(this.statusBar);

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
  // Status bar
  // ---------------------------------------------------------------------------

  private refresh(doc?: vscode.TextDocument) {
    if (!doc || !this.isJsonOrYaml(doc)) {
      this.statusBar.hide();
      return;
    }
    const binding = this.findBinding(doc);
    if (binding) {
      this.statusBar.text = `$(check) Schema: ${path.basename(binding)}`;
      this.statusBar.tooltip = `Local schema bound: ${binding}\nClick to change or remove`;
    } else {
      this.statusBar.text = `$(circle-slash) Schema: unbound`;
      this.statusBar.tooltip = 'No local JSON Schema bound to this file\nClick to bind one';
    }
    this.statusBar.show();
  }

  private isJsonOrYaml(doc: vscode.TextDocument): boolean {
    return ['json', 'jsonc', 'yaml', 'yml'].includes(doc.languageId);
  }

  /** Returns the schema URL/path bound to this file via workspace settings, or undefined. */
  private findBinding(doc: vscode.TextDocument): string | undefined {
    const rel = vscode.workspace.asRelativePath(doc.uri, false);

    // json.schemas: array of { url, fileMatch[] }
    const jsonSchemas = vscode.workspace.getConfiguration('json').get<any[]>('schemas') ?? [];
    for (const entry of jsonSchemas) {
      const patterns: string[] = entry.fileMatch ?? [];
      if (patterns.some(p => normalise(p) === normalise(rel))) {
        return entry.url as string;
      }
    }

    // yaml.schemas: { schemaPath: filePattern | filePattern[] }
    const yamlSchemas =
      vscode.workspace.getConfiguration('yaml').get<Record<string, string | string[]>>('schemas') ?? {};
    for (const [schemaPath, patterns] of Object.entries(yamlSchemas)) {
      const arr = Array.isArray(patterns) ? patterns : [patterns];
      if (arr.some(p => normalise(p) === normalise(rel))) {
        return schemaPath;
      }
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Bind command
  // ---------------------------------------------------------------------------

  async bindToCurrentFile() {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || !this.isJsonOrYaml(doc)) {
      vscode.window.showInformationMessage('Open a JSON or YAML file to bind a schema.');
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!folder) {
      vscode.window.showErrorMessage('The file must be inside a workspace folder.');
      return;
    }

    const schemaItems = await this.findWorkspaceSchemas();
    if (!schemaItems.length) {
      vscode.window.showWarningMessage(
        'No JSON Schema files found in workspace (files must contain a $schema field).'
      );
      return;
    }

    type Item = vscode.QuickPickItem & { uri?: vscode.Uri };

    const current = this.findBinding(doc);
    const removeItem: Item = {
      label: '$(trash) Remove binding',
      description: current ? `currently: ${current}` : undefined,
    };

    const items: Item[] = [
      removeItem,
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      ...schemaItems,
    ];

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: `Bind schema → ${vscode.workspace.asRelativePath(doc.uri)}`,
      matchOnDescription: true,
    });

    if (!pick) {
      return;
    }

    const relFile = vscode.workspace.asRelativePath(doc.uri, false);
    const isYaml = ['yaml', 'yml'].includes(doc.languageId);

    if (pick === removeItem) {
      await this.removeBinding(relFile, isYaml, folder);
    } else {
      const relSchema = `./${vscode.workspace.asRelativePath(pick.uri!, false)}`;
      await this.addBinding(relFile, relSchema, isYaml, folder);
    }

    this.refresh(doc);
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
        if (!isSchema) {
          continue;
        }
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
  // Settings helpers
  // ---------------------------------------------------------------------------

  private async addBinding(
    relFile: string,
    relSchema: string,
    isYaml: boolean,
    folder: vscode.WorkspaceFolder
  ) {
    if (isYaml) {
      const cfg = vscode.workspace.getConfiguration('yaml', folder.uri);
      const schemas = cfg.get<Record<string, string | string[]>>('schemas') ?? {};
      // Remove this file from any existing schema entry
      for (const key of Object.keys(schemas)) {
        const dropped = dropPattern(schemas[key], relFile);
        if (!dropped) delete schemas[key];
        else schemas[key] = dropped;
      }
      schemas[relSchema] = relFile;
      await cfg.update('schemas', schemas, vscode.ConfigurationTarget.Workspace);
    } else {
      const cfg = vscode.workspace.getConfiguration('json', folder.uri);
      const schemas = (cfg.get<any[]>('schemas') ?? []).filter(
        s => !matchesFile(s.fileMatch ?? [], relFile)
      );
      schemas.push({ url: relSchema, fileMatch: [relFile] });
      await cfg.update('schemas', schemas, vscode.ConfigurationTarget.Workspace);
    }

    vscode.window.showInformationMessage(
      `Schema bound: ${path.basename(relSchema)} → ${path.basename(relFile)}`
    );
  }

  private async removeBinding(
    relFile: string,
    isYaml: boolean,
    folder: vscode.WorkspaceFolder
  ) {
    if (isYaml) {
      const cfg = vscode.workspace.getConfiguration('yaml', folder.uri);
      const schemas = cfg.get<Record<string, string | string[]>>('schemas') ?? {};
      for (const key of Object.keys(schemas)) {
        const dropped = dropPattern(schemas[key], relFile);
        if (!dropped) delete schemas[key];
        else schemas[key] = dropped;
      }
      await cfg.update('schemas', schemas, vscode.ConfigurationTarget.Workspace);
    } else {
      const cfg = vscode.workspace.getConfiguration('json', folder.uri);
      const schemas = (cfg.get<any[]>('schemas') ?? []).filter(
        s => !matchesFile(s.fileMatch ?? [], relFile)
      );
      await cfg.update('schemas', schemas, vscode.ConfigurationTarget.Workspace);
    }

    vscode.window.showInformationMessage(`Schema binding removed from ${path.basename(relFile)}`);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Returns the schema path bound to this document via workspace settings,
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
