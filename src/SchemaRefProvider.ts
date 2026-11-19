// F13 — `$ref` go-to-definition and hover. Thin VS Code glue over the pure
// locators in schemaPointer.ts. Registered for JSON/JSONC/YAML schema files.
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
  codeSpan,
  parseSchemaText,
  type SchemaAst,
  type RefHit,
} from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { SchemaAuthManager } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';
import { languageForSchemaSource } from './languages';
import { getSchemaDetection } from './settings';
import { extractInlineSchemaReference, resolveLocalSchemaPath } from './SchemaBindingManager';

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
  document: vscode.TextDocument;
  uri: string;
  version: number;
  text: string;
  languageId: string;
  ast: SchemaAst;
  pojo?: unknown;
  pojoComputed: boolean;
}

export class SchemaRefProvider implements vscode.DefinitionProvider, vscode.HoverProvider {
  constructor(private readonly cache: SchemaCache) {}

  private parsed: ParsedDoc | undefined;
  private source: {
    document: vscode.TextDocument;
    version: number;
    languageId: string;
    detection: string;
    schema: boolean;
    binding: ReturnType<typeof extractInlineSchemaReference>;
  } | undefined;

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
    const { hit, parsed, inline } = found;
    const { uri, fragment } = parseRef(hit.ref);
    const segments = parseJsonPointer(fragment);

    if (refKind(hit.ref) === 'local') {
      if (!parsed) { return undefined; }
      const span = locateInAst(parsed.ast, segments);
      if (!span) { return undefined; }
      const range = new vscode.Range(positionAt(parsed.text, span.start), positionAt(parsed.text, span.end));
      return new vscode.Location(document.uri, range);
    }

    const target = this.resolveTargetDoc(document, uri, hit.ref, inline);
    if (!target) { return undefined; }
    return this.locationIn(target, segments);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const found = this.refAt(document, position);
    if (!found) { return undefined; }
    const { hit, parsed, inline } = found;
    const { uri, fragment } = parseRef(hit.ref);
    const segments = parseJsonPointer(fragment);
    const kind = refKind(hit.ref);
    const label = inline ? '$schema' : '$ref';
    const heading = `**${label}** ${codeSpan(hit.ref)}`;

    let root: unknown;
    if (kind === 'local') {
      if (!parsed) { return undefined; }
      root = this.getPojo(parsed);
    } else if (kind === 'relative') {
      const target = this.readRelative(document, uri, inline);
      if (!target) { return undefined; }
      root = parseSchemaText(target.text, target.languageId);
    } else {
      const target = this.readCachedRemote(uri || hit.ref, hit.ref);
      if (!target) {
        // F13-FR-10: never fetch on hover; point at the caching command instead.
        return new vscode.Hover(new vscode.MarkdownString(
          `${heading}\n\n_Remote schema is not cached. Run **JSON Schema: Cache Schema Locally** to enable navigation and hover._`,
        ));
      }
      root = parseSchemaText(target.text, target.languageId);
    }

    const value = resolvePointer(root, segments);
    if (value === undefined) {
      return new vscode.Hover(new vscode.MarkdownString(
        `${heading}\n\n_Pointer ${codeSpan(fragment || '#')} does not resolve in the target document._`,
      ));
    }
    return new vscode.Hover(new vscode.MarkdownString(describeRefTarget(value, hit.ref, label)));
  }

  // ── Shared helpers ───────────────────────────────────────────────────────────

  private refAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): { hit: RefHit; parsed?: ParsedDoc; inline: boolean } | undefined {
    const offset = document.offsetAt(position);
    const { schema, binding } = this.classify(document);
    if (schema) {
      const parsed = this.getParsed(document);
      const hit = parsed && findRefInAst(parsed.ast, offset);
      if (hit) { return { hit, parsed, inline: false }; }
    }
    // A schema file's own `$schema` is its meta-schema, not a binding; only a
    // yaml-language-server directive binds it to another schema (F13-FR-11).
    if (!binding || (schema && !binding.directive)) { return undefined; }
    if (offset < binding.start || offset >= binding.end) { return undefined; }
    return { hit: { ref: binding.url, valueStart: binding.start, valueEnd: binding.end }, inline: true };
  }

  /** Whether `document` is a schema (the same decision as the rest of the
   *  extension, F34) and its inline binding, computed once per document version
   *  and detection setting so hovers on an unchanged file never re-read it
   *  (F13-NFR-02). */
  private classify(
    document: vscode.TextDocument,
  ): { schema: boolean; binding: ReturnType<typeof extractInlineSchemaReference> } {
    const detection = getSchemaDetection();
    if (!this.source || this.source.document !== document || this.source.version !== document.version
      || this.source.languageId !== document.languageId || this.source.detection !== detection) {
      this.source = {
        document, version: document.version, languageId: document.languageId, detection,
        schema: isJsonSchemaFile(document), binding: extractInlineSchemaReference(document),
      };
    }
    return this.source;
  }

  /** Parses `document` once and reuses the result across calls for the same
   *  uri+version, so repeated hover/definition requests on an unchanged
   *  document (the common case) never re-parse it. */
  private getParsed(document: vscode.TextDocument): ParsedDoc | undefined {
    const key = document.uri.toString();
    if (this.parsed && this.parsed.document === document && this.parsed.uri === key && this.parsed.version === document.version
      && this.parsed.languageId === document.languageId) {
      return this.parsed;
    }
    const text = document.getText();
    const ast = parseSchemaAst(text, document.languageId);
    if (!ast) { this.parsed = undefined; return undefined; }
    this.parsed = { document, uri: key, version: document.version, text, languageId: document.languageId, ast, pojoComputed: false };
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

  /** Resolve a relative or cached-remote ref to a readable target document. */
  private resolveTargetDoc(
    document: vscode.TextDocument,
    uri: string,
    ref: string,
    inline = false,
  ): TargetDoc | undefined {
    if (refKind(ref) === 'relative') { return this.readRelative(document, uri, inline); }
    const remote = this.readCachedRemote(uri || ref, ref);
    if (!remote) {
      // F13-FR-06: offer to cache instead of failing silently.
      void vscode.window.showInformationMessage(
        `Schema ${SchemaAuthManager.hostOf(uri || ref)} is not cached locally. Cache it to enable navigation.`,
        'Cache Schema Locally',
      ).then(pick => {
        if (pick === 'Cache Schema Locally') {
          void vscode.commands.executeCommand('jsonschema.cacheSchemaLocally', uri || ref, document.uri);
        }
      });
    }
    return remote;
  }

  private readRelative(document: vscode.TextDocument, relUri: string, inline = false): TargetDoc | undefined {
    try {
      // An inline binding follows the validator's resolution (F13-FR-12); a
      // `$ref` resolves against the schema file that contains it.
      const filePath = inline
        ? resolveLocalSchemaPath(relUri, document.uri)
        : relUri.startsWith('file://')
          ? vscode.Uri.parse(relUri).fsPath
          : path.resolve(path.dirname(document.uri.fsPath), relUri);
      const text = fs.readFileSync(filePath, 'utf-8');
      return { text, languageId: languageForSchemaSource(filePath), uri: vscode.Uri.file(filePath) };
    } catch {
      return undefined;
    }
  }

  private readCachedRemote(url: string, originalRef = url): TargetDoc | undefined {
    // Cache entries written by the palette may retain the fragment. Prefer
    // the canonical document URL, then accept that existing full-URL entry.
    let key = url;
    let text = this.cache.readCached(key);
    if (text === undefined && originalRef !== key) {
      key = originalRef;
      text = this.cache.readCached(key);
    }
    if (text === undefined) { return undefined; }
    const cachedPath = this.cache.getCachedPath(key);
    if (!cachedPath) { return undefined; }
    // F13-FR-06: the cache file on disk is always named `<hash>.json` (F08)
    // regardless of the schema's authored format, so the language must be
    // determined from the original URL, not the cached file's own extension.
    return { text, languageId: languageForSchemaSource(url), uri: vscode.Uri.file(cachedPath) };
  }
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
