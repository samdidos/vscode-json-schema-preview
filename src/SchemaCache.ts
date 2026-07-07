import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SchemaAuthManager } from './SchemaAuthManager';
import { getRemoteFetchTimeoutMs } from './settings';
import { languageForSchemaSource } from './languages';
import { parseSchemaText } from './schemaPointer';

interface CacheEntry {
  originalUrl: string;
  cachedPath: string;
  // Revalidation metadata (F08-FR-16). Persisted so conditional requests and
  // the daily throttle survive a VS Code restart. Absent on entries written
  // before this feature (they simply revalidate unconditionally the first time).
  etag?: string;
  lastModified?: string;
  fetchedAt?: number; // epoch ms of the last successful (200/304) fetch
}

/** Outcome of an automatic revalidation (F08-FR-14/15/17). */
export type RevalidateOutcome =
  | 'no-entry'      // nothing cached for this URL
  | 'skipped'       // within the daily throttle window
  | 'not-modified'  // server answered 304
  | 'updated'       // cache file rewritten from a fresh 200
  | 'failed';       // network/auth error — stale copy left in place, silently

const CACHE_KEY = 'schemaauth.cache';
const DAY_MS = 24 * 60 * 60 * 1000;

export class SchemaCache {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: SchemaAuthManager,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  /** Download `url` to a stable local file (replacing any previous version). Returns the local path. */
  async download(url: string): Promise<string> {
    const localPath = this.localPathFor(url);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    // Capture ETag / Last-Modified on the initial download so later automatic
    // revalidations can be conditional (F08-FR-15/16).
    const res = await this.auth.fetchConditional(url, getRemoteFetchTimeoutMs());
    fs.writeFileSync(localPath, toCacheableText(url, res.text ?? ''), 'utf-8');

    await this.upsertEntry({
      originalUrl: url,
      cachedPath: localPath,
      etag: res.etag,
      lastModified: res.lastModified,
      fetchedAt: Date.now(),
    });
    return localPath;
  }

  /**
   * Revalidate a cached schema without user-visible errors (F08-FR-14/15/17).
   * In `daily` mode the check is skipped when the entry was fetched within the
   * last 24 h. A conditional request is sent when validators are known; a `304`
   * leaves the file untouched, a `200` overwrites it, and any failure is
   * swallowed so the stale copy keeps serving the language server.
   */
  async revalidate(url: string, mode: 'onOpen' | 'daily'): Promise<RevalidateOutcome> {
    const entry = this.entries().find(e => e.originalUrl === url);
    if (!entry) { return 'no-entry'; }
    // F08-FR-19: attempt the real operation instead of a separate existence
    // check (fs.existsSync) whose result would otherwise be relied on by the
    // write far below, across an async network await — a TOCTOU gap.
    try {
      fs.readFileSync(entry.cachedPath);
    } catch {
      return 'no-entry';
    }

    if (mode === 'daily' && entry.fetchedAt !== undefined && Date.now() - entry.fetchedAt < DAY_MS) {
      return 'skipped';
    }

    try {
      const res = await this.auth.fetchConditional(url, getRemoteFetchTimeoutMs(), {
        etag: entry.etag,
        lastModified: entry.lastModified,
      });
      if (res.status === 304 || res.text === undefined) {
        // Unchanged — refresh only the throttle timestamp so `daily` resets.
        await this.upsertEntry({ ...entry, fetchedAt: Date.now() });
        return 'not-modified';
      }
      fs.writeFileSync(entry.cachedPath, toCacheableText(url, res.text), 'utf-8');
      await this.upsertEntry({
        originalUrl: url,
        cachedPath: entry.cachedPath,
        etag: res.etag,
        lastModified: res.lastModified,
        fetchedAt: Date.now(),
      });
      return 'updated';
    } catch {
      // F08-FR-17: automatic revalidation never surfaces UI; keep the stale copy.
      return 'failed';
    }
  }

  /** True if a local copy of `url` exists on disk. */
  isCached(url: string): boolean {
    return !!this.getCachedPath(url);
  }

  /**
   * Read the cached content for `url`, or undefined if there is no cached copy
   * or it cannot be read. Used for the offline stale-cache fallback (S04-SR-01).
   */
  readCached(url: string): string | undefined {
    const cachedPath = this.getCachedPath(url);
    if (!cachedPath) return undefined;
    try {
      return fs.readFileSync(cachedPath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  /** Local file path for a cached URL, or undefined if not on disk. */
  private getCachedPath(url: string): string | undefined {
    const entry = this.entries().find(e => e.originalUrl === url);
    return entry && fs.existsSync(entry.cachedPath) ? entry.cachedPath : undefined;
  }

  /** Original URL for a local cached path (accepts absolute path or file:// URI). */
  getOriginalUrl(localPath: string): string | undefined {
    const fsPath = localPath.startsWith('file://')
      ? vscode.Uri.parse(localPath).fsPath
      : localPath;
    return this.entries().find(e => e.cachedPath === fsPath)?.originalUrl;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private get cacheDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'schema-cache');
  }

  private localPathFor(url: string): string {
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    return path.join(this.cacheDir, `${hash}.json`);
  }

  private entries(): CacheEntry[] {
    return this.context.globalState.get<CacheEntry[]>(CACHE_KEY, []);
  }

  private async upsertEntry(entry: CacheEntry): Promise<void> {
    const updated = this.entries().filter(e => e.originalUrl !== entry.originalUrl);
    updated.push(entry);
    await this.context.globalState.update(CACHE_KEY, updated);
  }
}

/**
 * Validates fetched schema content as parseable per its source format
 * (JSON/JSONC or YAML) and returns a canonical JSON re-serialization to
 * persist (F08-FR-18). This rejects a malformed/corrupted response before it
 * is ever written to disk, and — since the cached bytes are now derived from
 * a parsed value rather than passed through verbatim — breaks the direct
 * network-response-to-disk-write data flow.
 */
function toCacheableText(url: string, text: string): string {
  const parsed = parseSchemaText(text, languageForSchemaSource(url));
  if (parsed === undefined) {
    throw new Error(`Fetched content for ${SchemaAuthManager.hostOf(url)} is not valid JSON/YAML — refusing to cache it.`);
  }
  return JSON.stringify(parsed);
}
