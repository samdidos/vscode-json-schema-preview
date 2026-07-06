// F13 — `$ref` go-to-definition and hover. Thin VS Code glue over the pure
// locators in schemaPointer.ts. Registered for JSON/JSONC/YAML schema files.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  findRefAtOffset,
  parseRef,
  refKind,
  parseJsonPointer,
  locatePointerTarget,
  resolvePointer,
  describeRefTarget,
  parseSchemaText,
} from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { SchemaAuthManager } from './SchemaAuthManager';
import { SchemaCache } from './SchemaCache';

const SELECTOR: vscode.DocumentSelector = [
  { language: 'json' },
  { language: 'jsonc' },
  { language: 'yaml' },
  { language: 'yml' },
];

/** A resolved target document: its text, language, and URI. */
interface TargetDoc {
  text: string;
  languageId: string;
  uri: vscode.Uri;
}

export class SchemaRefProvider implements vscode.DefinitionProvider, vscode.HoverProvider {
  constructor(private readonly cache: SchemaCache) {}

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
    const hit = this.refAt(document, position);
    if (!hit) { return undefined; }
    const { uri, fragment } = parseRef(hit.ref);
    const segments = parseJsonPointer(fragment);

    if (refKind(hit.ref) === 'local') {
      return this.locationIn({ text: document.getText(), languageId: document.languageId, uri: document.uri }, segments);
    }

    const target = this.resolveTargetDoc(document, uri, hit.ref);
    if (!target) { return undefined; }
    return this.locationIn(target, segments);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const hit = this.refAt(document, position);
    if (!hit) { return undefined; }
    const { uri, fragment } = parseRef(hit.ref);
    const segments = parseJsonPointer(fragment);
    const kind = refKind(hit.ref);

    let target: TargetDoc | undefined;
    if (kind === 'local') {
      target = { text: document.getText(), languageId: document.languageId, uri: document.uri };
    } else if (kind === 'relative') {
      target = this.readRelative(document, uri);
    } else {
      target = this.readCachedRemote(uri || hit.ref);
      if (!target) {
        // F13-FR-10: never fetch on hover; point at the caching command instead.
        return new vscode.Hover(new vscode.MarkdownString(
          `**$ref** \`${hit.ref}\`\n\n_Remote schema is not cached. Run **JSON Schema: Cache Schema Locally** to enable navigation and hover._`,
        ));
      }
    }
    if (!target) { return undefined; }

    const root = parseSchemaText(target.text, target.languageId);
    const value = resolvePointer(root, segments);
    if (value === undefined) {
      return new vscode.Hover(new vscode.MarkdownString(
        `**$ref** \`${hit.ref}\`\n\n_Pointer \`${fragment || '#'}\` does not resolve in the target document._`,
      ));
    }
    const md = new vscode.MarkdownString(describeRefTarget(value, hit.ref));
    return new vscode.Hover(md);
  }

  // ── Shared helpers ───────────────────────────────────────────────────────────

  private refAt(document: vscode.TextDocument, position: vscode.Position) {
    if (!isJsonSchemaFile(document)) { return undefined; }
    const offset = document.offsetAt(position);
    return findRefAtOffset(document.getText(), document.languageId, offset);
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
  ): TargetDoc | undefined {
    if (refKind(ref) === 'relative') { return this.readRelative(document, uri); }
    const remote = this.readCachedRemote(uri || ref);
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

  private readRelative(document: vscode.TextDocument, relUri: string): TargetDoc | undefined {
    try {
      const baseDir = path.dirname(document.uri.fsPath);
      const filePath = path.resolve(baseDir, relUri);
      const text = fs.readFileSync(filePath, 'utf-8');
      return { text, languageId: languageForPath(filePath), uri: vscode.Uri.file(filePath) };
    } catch {
      return undefined;
    }
  }

  private readCachedRemote(url: string): TargetDoc | undefined {
    const text = this.cache.readCached(url);
    if (text === undefined) { return undefined; }
    return { text, languageId: 'json', uri: vscode.Uri.file(`${url}`) };
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

function languageForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') { return 'yaml'; }
  if (ext === '.jsonc') { return 'jsonc'; }
  return 'json';
}
