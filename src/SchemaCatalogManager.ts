// F12 — schema catalog manager. Owns the network fetch (through the shared
// auth path), a 24 h global-storage cache with stale fallback, and the
// searchable QuickPick. Parsing/ranking lives in the pure schemaCatalog module.
import * as vscode from 'vscode';
import { parseCatalog, rankByFileMatch, type CatalogEntry } from './schemaCatalog';
import { SchemaAuthManager } from './SchemaAuthManager';
import { getCatalogSources, getRemoteFetchTimeoutMs } from './settings';

const CACHE_KEY = 'jsonschema.catalogCache';
const DAY_MS = 24 * 60 * 60 * 1000;

interface CatalogCacheEntry {
  fetchedAt: number;
  entries: CatalogEntry[];
}

interface LoadResult {
  suggested: CatalogEntry[];
  rest: CatalogEntry[];
  stale: boolean;
  warnings: string[];
}

type CatalogQuickPickItem = vscode.QuickPickItem & { url?: string };

export class SchemaCatalogManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: SchemaAuthManager,
  ) {}

  /**
   * Show a searchable catalog picker and return the chosen schema URL, or
   * undefined if cancelled. The picker opens immediately with a busy indicator
   * while catalogs load (F12-NFR-01) and marks its title stale on offline
   * fallback (F12-FR-11).
   */
  async browse(fileName: string): Promise<string | undefined> {
    const qp = vscode.window.createQuickPick<CatalogQuickPickItem>();
    qp.title = 'Browse schema catalog';
    qp.placeholder = 'Search schemas by name or description';
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.busy = true;
    qp.show();

    const selected = new Promise<string | undefined>(resolve => {
      qp.onDidAccept(() => { resolve(qp.selectedItems[0]?.url); qp.hide(); });
      qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
    });

    try {
      const { suggested, rest, stale, warnings } = await this.loadEntries(fileName);
      for (const w of warnings) { void vscode.window.showWarningMessage(w); }
      qp.items = buildItems(suggested, rest);
      if (stale) { qp.title = 'Browse schema catalog — offline, showing cached data'; }
    } finally {
      qp.busy = false;
    }
    return selected;
  }

  /**
   * Load and rank catalog entries from every enabled source. Never throws — a
   * source that fails and has no cache contributes a warning instead (F12-FR-06).
   * Sources are fetched concurrently (independent network calls) rather than
   * one at a time, so the picker's load time is the slowest single source, not
   * their sum; results/warnings stay in source-list order regardless of which
   * settles first.
   */
  async loadEntries(fileName: string): Promise<LoadResult> {
    const warnings: string[] = [];
    const all: CatalogEntry[] = [];
    let anyStale = false;

    const sources = getCatalogSources();
    const results = await Promise.allSettled(sources.map(source => this.fetchCatalog(source)));
    results.forEach((result, i) => {
      const source = sources[i];
      if (result.status === 'fulfilled') {
        anyStale ||= result.value.stale;
        for (const e of result.value.entries) { all.push({ ...e, source }); }
      } else {
        warnings.push(`Could not load schema catalog ${source}: ${(result.reason as Error).message}`);
      }
    });

    const { suggested, rest } = rankByFileMatch(all, fileName);
    return { suggested, rest, stale: anyStale, warnings };
  }

  /**
   * Fetch one catalog, honouring the 24 h cache TTL (F12-FR-10) and falling
   * back to a cached copy on failure (F12-FR-11).
   */
  private async fetchCatalog(url: string): Promise<{ entries: CatalogEntry[]; stale: boolean }> {
    const cached = this.readCache(url);
    if (cached && Date.now() - cached.fetchedAt < DAY_MS) {
      return { entries: cached.entries, stale: false };
    }
    try {
      const text = await this.auth.fetchText(url, getRemoteFetchTimeoutMs());
      const entries = parseCatalog(text);
      await this.writeCache(url, entries);
      return { entries, stale: false };
    } catch (e) {
      if (cached) { return { entries: cached.entries, stale: true }; }
      throw e;
    }
  }

  private readCache(url: string): CatalogCacheEntry | undefined {
    const all = this.context.globalState.get<Record<string, CatalogCacheEntry>>(CACHE_KEY, {});
    return all[url];
  }

  private async writeCache(url: string, entries: CatalogEntry[]): Promise<void> {
    const all = this.context.globalState.get<Record<string, CatalogCacheEntry>>(CACHE_KEY, {});
    all[url] = { fetchedAt: Date.now(), entries };
    await this.context.globalState.update(CACHE_KEY, all);
  }
}

/** Build QuickPick items, placing suggested entries under a separator (F12-FR-07/08). */
export function buildItems(
  suggested: CatalogEntry[],
  rest: CatalogEntry[],
): CatalogQuickPickItem[] {
  const items: CatalogQuickPickItem[] = [];
  const toItem = (e: CatalogEntry): CatalogQuickPickItem => ({
    label: e.name,
    description: e.description,
    detail: e.source ? `${e.url}  ·  ${SchemaAuthManager.hostOf(e.source)}` : e.url,
    url: e.url,
  });
  if (suggested.length) {
    items.push({ label: 'Suggested for this file', kind: vscode.QuickPickItemKind.Separator });
    items.push(...suggested.map(toItem));
    if (rest.length) {
      items.push({ label: 'All schemas', kind: vscode.QuickPickItemKind.Separator });
    }
  }
  items.push(...rest.map(toItem));
  return items;
}
