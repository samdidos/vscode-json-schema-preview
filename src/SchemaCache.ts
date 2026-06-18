import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SchemaAuthManager } from './SchemaAuthManager';

interface CacheEntry {
  originalUrl: string;
  cachedPath: string;
}

const CACHE_KEY = 'schemaauth.cache';

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

    const content = await this.auth.fetchText(url);
    fs.writeFileSync(localPath, content, 'utf-8');

    await this.upsertEntry({ originalUrl: url, cachedPath: localPath });
    return localPath;
  }

  /** True if a local copy of `url` exists on disk. */
  isCached(url: string): boolean {
    return !!this.getCachedPath(url);
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
