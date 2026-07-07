// F12 — schema catalog parsing and matching. Pure and VS Code-free: it turns a
// SchemaStore-format catalog document into validated entries and ranks them by
// `fileMatch` against the data file being bound. The manager layer owns the
// network, cache, and QuickPick.

export interface CatalogEntry {
  name: string;
  url: string;
  description?: string;
  fileMatch?: string[];
  /** Which catalog source this entry came from (added by the manager). */
  source?: string;
}

/**
 * Parse a catalog document in the SchemaStore format
 * (`{ "schemas": [{ name, description?, url, fileMatch? }] }`). Throws when the
 * text is not JSON or lacks a `schemas` array (F12-FR-06, total failure);
 * individual malformed entries are skipped rather than aborting.
 */
export function parseCatalog(text: string): CatalogEntry[] {
  const data = JSON.parse(text) as unknown;
  const schemas = (data as { schemas?: unknown })?.schemas;
  if (!Array.isArray(schemas)) {
    throw new Error('catalog document has no "schemas" array');
  }
  const entries: CatalogEntry[] = [];
  for (const raw of schemas) {
    if (!raw || typeof raw !== 'object') { continue; }
    const s = raw as Record<string, unknown>;
    if (typeof s.name !== 'string' || typeof s.url !== 'string') { continue; }
    const entry: CatalogEntry = { name: s.name, url: s.url };
    if (typeof s.description === 'string') { entry.description = s.description; }
    if (Array.isArray(s.fileMatch)) {
      entry.fileMatch = s.fileMatch.filter((f): f is string => typeof f === 'string');
    }
    entries.push(entry);
  }
  return entries;
}

/** Convert a SchemaStore `fileMatch` glob to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

/**
 * True when any `fileMatch` glob matches `fileName` (a workspace-relative path).
 * A pattern without a slash matches the basename or the full path; a pattern
 * with a slash matches the full path — mirroring VS Code `fileMatch` semantics.
 */
export function fileMatches(patterns: string[] | undefined, fileName: string): boolean {
  if (!patterns?.length) { return false; }
  const base = fileName.split('/').pop() ?? fileName;
  return patterns.some(p => {
    const rx = globToRegExp(p);
    return p.includes('/') ? rx.test(fileName) : rx.test(base) || rx.test(fileName);
  });
}

/**
 * Partition catalog entries into those whose `fileMatch` matches `fileName`
 * (suggested first) and the rest, preserving input order within each group
 * (F12-FR-08).
 */
export function rankByFileMatch(
  entries: CatalogEntry[],
  fileName: string,
): { suggested: CatalogEntry[]; rest: CatalogEntry[] } {
  const suggested: CatalogEntry[] = [];
  const rest: CatalogEntry[] = [];
  for (const e of entries) {
    (fileMatches(e.fileMatch, fileName) ? suggested : rest).push(e);
  }
  return { suggested, rest };
}
