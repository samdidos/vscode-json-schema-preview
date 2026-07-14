// F04-FR-15 — detect a schema VS Code resolves *natively* for a data file, so
// the binding status bar doesn't say "unbound" when the file is already
// schema-backed. Two sources, both matched by `fileMatch` (VS Code's own
// semantics, reused from schemaCatalog): an installed extension's
// `contributes.jsonValidation`, and the SchemaStore/user catalog (F12). Pure and
// VS Code-free — the manager layer supplies the extension list and cached
// catalog entries.

import { fileMatches, type CatalogEntry } from './schemaCatalog';

export interface NativeSchemaSource {
  fileMatch?: string[];
  /** The schema URL (or extension-relative path) — used for the tooltip. */
  url: string;
  /** Human name when known (catalog entries carry one; jsonValidation doesn't). */
  name?: string;
  /** Where the association comes from, for the tooltip wording. */
  origin: 'extension' | 'catalog';
}

export interface NativeSchemaMatch {
  url: string;
  name?: string;
  origin: 'extension' | 'catalog';
}

/** Coerce a `jsonValidation.fileMatch` (string | string[] | undefined) to string[]. */
function toPatterns(fileMatch: unknown): string[] | undefined {
  if (typeof fileMatch === 'string') { return [fileMatch]; }
  if (Array.isArray(fileMatch)) { return fileMatch.filter((f): f is string => typeof f === 'string'); }
  return undefined;
}

/** The minimal shape of a VS Code extension this module reads. */
export interface ExtensionLike {
  packageJSON?: { contributes?: { jsonValidation?: unknown } };
}

/**
 * Extract `{ fileMatch, url }` associations from every extension's
 * `contributes.jsonValidation` (built-in extensions included). Entries without a
 * string `url` are skipped.
 */
export function jsonValidationSources(extensions: readonly ExtensionLike[]): NativeSchemaSource[] {
  const out: NativeSchemaSource[] = [];
  for (const ext of extensions) {
    const contribs = ext.packageJSON?.contributes?.jsonValidation;
    if (!Array.isArray(contribs)) { continue; }
    for (const c of contribs) {
      if (!c || typeof c.url !== 'string') { continue; }
      out.push({ fileMatch: toPatterns(c.fileMatch), url: c.url, origin: 'extension' });
    }
  }
  return out;
}

/** Map cached catalog entries (F12) to native sources. */
export function catalogSources(entries: readonly CatalogEntry[]): NativeSchemaSource[] {
  return entries.map(e => ({ fileMatch: e.fileMatch, url: e.url, name: e.name, origin: 'catalog' as const }));
}

/**
 * First source whose `fileMatch` matches `fileName` (a workspace-relative path).
 * A source with no `fileMatch` never matches — an association with no file
 * pattern applies to nothing in particular, so it must not claim this file.
 */
export function matchNativeSchema(fileName: string, sources: readonly NativeSchemaSource[]): NativeSchemaMatch | undefined {
  for (const s of sources) {
    if (s.fileMatch && s.fileMatch.length && fileMatches(s.fileMatch, fileName)) {
      return { url: s.url, name: s.name, origin: s.origin };
    }
  }
  return undefined;
}

/** A short display label for a match: the catalog name, else the URL basename. */
export function nativeSchemaLabel(match: NativeSchemaMatch): string {
  if (match.name && match.name.trim()) { return match.name.trim(); }
  const withoutQuery = match.url.split(/[?#]/)[0];
  const base = withoutQuery.split('/').filter(Boolean).pop();
  return base || match.url;
}
