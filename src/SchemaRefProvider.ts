// F13 — `$ref` go-to-definition and hover, plus the same for a data file's
// inline `$schema` binding (F13-FR-11..13). Thin VS Code glue over the pure
// locators in schemaPointer.ts and the binding helpers in SchemaBindingManager.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseRef,
  refKind,
  parseJsonPointer,
  locatePointerTarget,
  locateInAst,
  findRefInAst,
  parseSchemaAst,
  resolvePointer,
  describeRefTarget,
  refHoverHeading,
  markdownCode,
  parseSchemaText,
  type SchemaAst,
} from './schemaPointer';
import { isJsonSchemaFile, isJsonSchemaMetaRef } from './PreviewWebPanel';
import { SchemaAuthManager } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { languageForSchemaSource } from './languages';
import {
  findInlineSchemaBinding,
  resolveLocalSchemaPath,
  type InlineSchemaBinding,
} from './SchemaBindingManager';

const SELECTOR: vscode.DocumentSelector = [
  { language: 'json' },
  { language: 'jsonc' },
  { language: 'yaml' },
  { language: 'yml' },
  { language: 'toml' },
];

/** A resolved target document: its text, language, and URI. */
interface TargetDoc {
  text: string;
  languageId: string;
  uri: vscode.Uri;
}

/** Memoized parse of the active document, keyed by uri+version. A single slot
 *  is enough to avoid re-parsing the same unchanged document on every hover
 *  event or go-to-definition within one file — the common interactive case —
 *  without needing disposal wiring for closed documents (F13-NFR). */
interface ParsedDoc {
  uri: string;
  version: number;
  text: string;
  languageId: string;
  ast: SchemaAst;
  pojo?: unknown;
  pojoComputed: boolean;
}

/** Memoized inline binding of the active document, keyed like {@link ParsedDoc}
 *  plus the language (a language switch keeps the version). */
interface BindingSlot {
  uri: string;
  version: number;
  languageId: string;
  binding: InlineSchemaBinding | undefined;
}

/** What the cursor is on: a `$ref` in a schema (with that schema's parse), or
 *  an inline binding in a data file (no `parsed`). */
interface Found {
  ref: string;
  parsed?: ParsedDoc;
}

const CACHE_ACTION = 'Cache Schema Locally';

export class SchemaRefProvider implements vscode.DefinitionProvider, vscode.HoverProvider {
  constructor(private readonly cache: SchemaCache) {}

  private parsed: ParsedDoc | undefined;
  private bindingSlot: BindingSlot | undefined;

  /** Register both providers; returns the disposables. */
  static register(cache: SchemaCache): vscode.Disposable[] {
    const provider = new SchemaRefProvider(cache);
    return [
      vscode.languages.registerDefinitionProvider(SELECTOR, provider),
      vscode.languages.registerHoverProvider(SELECTOR, provider),
    ];
  }

  // ── Definition ─────────────────────────────────────────────────────────────

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location | undefined {
    const found = this.refAt(document, position);
    if (!found) { return undefined; }
    const { ref, parsed } = found;
    const { uri, fragment } = parseRef(ref);
    const segments = parseJsonPointer(fragment);

    if (parsed && refKind(ref) === 'local') {
      const span = locateInAst(parsed.ast, segments);
      if (!span) { return undefined; }
      const range = new vscode.Range(positionAt(parsed.text, span.start), positionAt(parsed.text, span.end));
      return new vscode.Location(document.uri, range);
    }

    const target = this.resolveTargetDoc(document, found);
    if (!target) { return undefined; }
    // F13-FR-12: a binding without a fragment opens the schema at its top,
    // even when the schema itself does not parse.
    if (!parsed && segments.length === 0) {
      return new vscode.Location(target.uri, new vscode.Range(0, 0, 0, 0));
    }
    return this.locationIn(target, segments);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const found = this.refAt(document, position);
    if (!found) { return undefined; }
    const { ref, parsed } = found;
    const { fragment } = parseRef(ref);
    const label = parsed ? '$ref' : '$schema';
    const heading = refHoverHeading(ref, label);

    let root: unknown;
    if (parsed && refKind(ref) === 'local') {
      root = this.getPojo(parsed);
    } else {
      const remote = refKind(ref) === 'remote';
      const target = remote ? this.readCachedRemote(this.cacheKeys(found)) : this.readLocal(document, found);
      if (!target) {
        if (!remote) { return undefined; }
        // F13-FR-10/13: never fetch on hover; point at the caching command instead.
        return markdownHover(
          `${heading}\n\n_Remote schema is not cached. Run **JSON Schema: Cache Schema Locally** to enable navigation and hover._`,
        );
      }
      root = parseSchemaText(target.text, target.languageId);
      if (root === undefined) {
        return markdownHover(`${heading}\n\n_The target schema could not be parsed._`);
      }
    }

    const value = resolvePointer(root, parseJsonPointer(fragment));
    if (value === undefined) {
      return markdownHover(
        `${heading}\n\n_Pointer ${markdownCode(fragment || '#')} does not resolve in the target document._`,
      );
    }
    return markdownHover(describeRefTarget(value, ref, label));
  }

  // ── Shared helpers ───────────────────────────────────────────────────────────

  private refAt(document: vscode.TextDocument, position: vscode.Position): Found | undefined {
    const offset = document.offsetAt(position);
    // F13-FR-11: the inline binding first. A binding naming the meta-schema
    // marks a schema file, which keeps its `$ref` navigation below.
    const binding = this.getBinding(document);
    if (binding && offset >= binding.start && offset <= binding.end && !isJsonSchemaMetaRef(binding.url)) {
      return { ref: binding.url };
    }
    if (!isJsonSchemaFile(document)) { return undefined; }
    const parsed = this.getParsed(document);
    if (!parsed) { return undefined; }
    const hit = findRefInAst(parsed.ast, offset);
    return hit ? { ref: hit.ref, parsed } : undefined;
  }

  /** The document's inline binding, located once per uri+version+language. */
  private getBinding(document: vscode.TextDocument): InlineSchemaBinding | undefined {
    const key = document.uri.toString();
    const slot = this.bindingSlot;
    if (slot && slot.uri === key && slot.version === document.version && slot.languageId === document.languageId) {
      return slot.binding;
    }
    const binding = findInlineSchemaBinding(document);
    this.bindingSlot = { uri: key, version: document.version, languageId: document.languageId, binding };
    return binding;
  }

  /** Parses `document` once and reuses the result across calls for the same
   *  uri+version, so repeated hover/definition requests on an unchanged
   *  document (the common case) never re-parse it. */
  private getParsed(document: vscode.TextDocument): ParsedDoc | undefined {
    const key = document.uri.toString();
    if (this.parsed && this.parsed.uri === key && this.parsed.version === document.version
      && this.parsed.languageId === document.languageId) {
      return this.parsed;
    }
    const text = document.getText();
    const ast = parseSchemaAst(text, document.languageId);
    if (!ast) { this.parsed = undefined; return undefined; }
    this.parsed = { uri: key, version: document.version, text, languageId: document.languageId, ast, pojoComputed: false };
    return this.parsed;
  }

  /** Lazily parses (and caches) the plain-value tree for a local-ref hover —
   *  computed only when actually needed, since a relative/remote-ref hover
   *  never uses the active document's own value tree. */
  private getPojo(parsed: ParsedDoc): unknown {
    if (!parsed.pojoComputed) {
      parsed.pojo = parseSchemaText(parsed.text, parsed.languageId);
      parsed.pojoComputed = true;
    }
    return parsed.pojo;
  }

  private locationIn(target: TargetDoc, segments: string[]): vscode.Location | undefined {
    const span = locatePointerTarget(target.text, target.languageId, segments);
    if (!span) { return undefined; }
    const range = new vscode.Range(
      positionAt(target.text, span.start),
      positionAt(target.text, span.end),
    );
    return new vscode.Location(target.uri, range);
  }

  /** Resolve a relative or cached-remote ref to a readable target document,
   *  offering to cache an uncached remote one (F13-FR-06/12). */
  private resolveTargetDoc(document: vscode.TextDocument, found: Found): TargetDoc | undefined {
    if (refKind(found.ref) !== 'remote') { return this.readLocal(document, found); }
    const remote = this.readCachedRemote(this.cacheKeys(found));
    if (!remote) {
      // An inline binding is cached under the value validation looks up — the
      // full binding; a `$ref` under its document URL.
      const url = found.parsed ? (parseRef(found.ref).uri || found.ref) : found.ref;
      void vscode.window.showInformationMessage(
        `Schema ${SchemaAuthManager.hostOf(url)} is not cached locally. Cache it to enable navigation.`,
        CACHE_ACTION,
      ).then(pick => {
        if (pick === CACHE_ACTION) {
          void vscode.commands.executeCommand('jsonschema.cacheSchemaLocally', url, document.uri);
        }
      });
    }
    return remote;
  }

  /** Read a local target: a `$ref` relative to the schema file's directory
   *  (F13-FR-05), an inline binding the way validation resolves it (F10-FR-17). */
  private readLocal(document: vscode.TextDocument, found: Found): TargetDoc | undefined {
    const { uri } = parseRef(found.ref);
    if (!uri) { return undefined; }
    try {
      const filePath = found.parsed
        ? path.resolve(path.dirname(document.uri.fsPath), uri)
        : resolveLocalSchemaPath(uri, document.uri);
      const text = fs.readFileSync(filePath, 'utf-8');
      return { text, languageId: languageForSchemaSource(filePath), uri: vscode.Uri.file(filePath) };
    } catch {
      return undefined;
    }
  }

  /** Cache keys to try, preferred first: F08 may have keyed the copy by the
   *  document URL or by the full value including its fragment (F13-FR-12). */
  private cacheKeys(found: Found): string[] {
    const documentUrl = parseRef(found.ref).uri;
    return found.parsed ? [documentUrl, found.ref] : [found.ref, documentUrl];
  }

  private readCachedRemote(keys: string[]): TargetDoc | undefined {
    for (const key of keys) {
      if (!key) { continue; }
      const cachedPath = this.cache.getCachedPath(key);
      const text = cachedPath ? this.cache.readCached(key) : undefined;
      if (cachedPath && text !== undefined) {
        // F13-FR-06: the cache file on disk is always named `<hash>.json` (F08)
        // regardless of the schema's authored format, so the language must be
        // determined from the original URL, not the cached file's own extension.
        return { text, languageId: languageForSchemaSource(parseRef(key).uri), uri: vscode.Uri.file(cachedPath) };
      }
    }
    return undefined;
  }
}

function markdownHover(markdown: string): vscode.Hover {
  return new vscode.Hover(new vscode.MarkdownString(markdown));
}

// ── Pure offset→Position (no TextDocument needed, so target files that are not
//    open in the editor can still be mapped) ──────────────────────────────────

export function positionAt(text: string, offset: number): vscode.Position {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lastNl = -1;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) { line++; lastNl = i; }
  }
  return new vscode.Position(line, clamped - lastNl - 1);
}
