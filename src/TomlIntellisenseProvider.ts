// F19 — TOML schema IntelliSense, the VS Code glue. Thin wrapper over the
// pure functions in tomlIntellisense.ts: completion and hover providers for
// TOML documents with an inline `$schema` binding (F11-FR-15). Schema loading
// is strictly I/O-passive — local files from disk, remote schemas from the
// F08 cache only, never a fetch (F19-FR-02, F19-NFR-02) — and every failure
// path returns "no results" rather than any error UI.
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  tomlPositionContext,
  keyCompletionsAt,
  valueCompletionsAt,
  tomlKeyAt,
  hoverMarkdownAt,
  type RefResolver,
} from './tomlIntellisense';
import { extractInlineSchemaUrl } from './SchemaBindingManager';
import { parseSchemaText, parseRef, refKind, parseJsonPointer, resolvePointer } from './schemaPointer';
import { SchemaCache } from './SchemaCache';
import { SchemaAuthManager } from './SchemaAuthManager';
import { computeTargetId } from './SchemaBundleCommand';
import { languageForSchemaSource } from './languages';

/** A loaded schema plus its position-independent ref resolver. */
interface LoadedSchema {
  root: unknown;
  resolveRef: RefResolver;
}

/** Memoized schema load, keyed by document uri+version and the inline ref it
 *  resolved — one load per document version, not per keystroke (F19-NFR-02). */
interface CachedLoad {
  docUri: string;
  docVersion: number;
  loaded: LoadedSchema | undefined;
}

export class TomlIntellisenseProvider implements vscode.CompletionItemProvider, vscode.HoverProvider {
  constructor(private readonly cache: SchemaCache) {}

  private lastLoad: CachedLoad | undefined;

  /** Register both providers for TOML documents (F19-FR-01). */
  static register(cache: SchemaCache): vscode.Disposable[] {
    const provider = new TomlIntellisenseProvider(cache);
    return [
      vscode.languages.registerCompletionItemProvider(
        { language: 'toml' }, provider, '.', '=', '"',
      ),
      vscode.languages.registerHoverProvider({ language: 'toml' }, provider),
    ];
  }

  // ── Completions (F19-FR-03/04/05) ────────────────────────────────────────

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    const loaded = this.loadSchema(document);
    if (!loaded) { return undefined; }
    const ctx = tomlPositionContext(document.getText(), document.offsetAt(position));

    if (ctx.mode === 'value') {
      return valueCompletionsAt(loaded.root, ctx, loaded.resolveRef).map(v => {
        const item = new vscode.CompletionItem(v.text, vscode.CompletionItemKind.Value);
        if (v.description) { item.documentation = new vscode.MarkdownString(v.description); }
        return item;
      });
    }

    return keyCompletionsAt(loaded.root, ctx, loaded.resolveRef).map(k => {
      const item = new vscode.CompletionItem(k.name, vscode.CompletionItemKind.Field);
      item.detail = k.required ? `${k.typeLabel} (required)` : k.typeLabel;
      if (k.description) { item.documentation = new vscode.MarkdownString(k.description); }
      // F19-FR-05: required properties sort before optional ones.
      item.sortText = `${k.required ? '0' : '1'}${k.name}`;
      return item;
    });
  }

  // ── Hover (F19-FR-07) ────────────────────────────────────────────────────

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const loaded = this.loadSchema(document);
    if (!loaded) { return undefined; }
    const keyPath = tomlKeyAt(document.getText(), document.offsetAt(position));
    if (!keyPath) { return undefined; }
    const markdown = hoverMarkdownAt(loaded.root, keyPath, loaded.resolveRef);
    return markdown ? new vscode.Hover(new vscode.MarkdownString(markdown)) : undefined;
  }

  // ── Schema loading (F19-FR-01/02) ────────────────────────────────────────

  private loadSchema(document: vscode.TextDocument): LoadedSchema | undefined {
    const key = document.uri.toString();
    if (this.lastLoad && this.lastLoad.docUri === key && this.lastLoad.docVersion === document.version) {
      return this.lastLoad.loaded;
    }
    const loaded = this.loadSchemaUncached(document);
    this.lastLoad = { docUri: key, docVersion: document.version, loaded };
    return loaded;
  }

  private loadSchemaUncached(document: vscode.TextDocument): LoadedSchema | undefined {
    const ref = extractInlineSchemaUrl(document);
    if (!ref) { return undefined; }

    const schemaPath = computeTargetId(ref, document.uri.fsPath);
    const text = this.readCacheOrDisk(schemaPath);
    if (text === undefined) { return undefined; }
    const root = parseSchemaText(text, languageForSchemaSource(schemaPath));
    if (root === undefined) { return undefined; }

    // F19-FR-06: `$ref`s resolve with F13 semantics — local pointer within
    // the schema, relative file next to the schema, cached remote — with all
    // reads best-effort and no network (F19-NFR-02). computeTargetId is the
    // same target-id logic F14's bundler and the F16 sample-data resolver use.
    const resolveRef: RefResolver = (r: string): unknown => {
      const { uri, fragment } = parseRef(r);
      const segments = parseJsonPointer(fragment);
      const kind = refKind(r);
      if (kind === 'local') { return resolvePointer(root, segments); }
      const targetId = kind === 'remote' ? (uri || r) : computeTargetId(uri, schemaPath);
      const targetText = this.readCacheOrDisk(targetId);
      if (targetText === undefined) { return undefined; }
      return resolvePointer(parseSchemaText(targetText, languageForSchemaSource(targetId)), segments);
    };

    return { root, resolveRef };
  }

  /** Local schemas read from disk; remote schemas from the F08 cache only —
   *  never a fetch (F19-FR-02, F19-NFR-02). */
  private readCacheOrDisk(id: string): string | undefined {
    if (SchemaAuthManager.isRemoteUrl(id)) { return this.cache.readCached(id); }
    try {
      return fs.readFileSync(id, 'utf-8');
    } catch {
      return undefined;
    }
  }
}
