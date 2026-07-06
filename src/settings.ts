import * as vscode from 'vscode';

// Default timeouts (ms). These mirror the `default` values declared for the
// matching settings in package.json and the budgets in specs/S03-performance.md
// (S03-SR-11 render subprocess, S03-SR-12 remote fetch).
export const DEFAULT_RENDER_TIMEOUT_MS = 30_000;
export const DEFAULT_REMOTE_FETCH_TIMEOUT_MS = 30_000;

// Floor for any user-configured timeout. A mistyped tiny value (e.g. 10 ms)
// would otherwise make every render or fetch fail instantly (S03-SR-14).
export const MIN_TIMEOUT_MS = 1_000;

/**
 * Clamp a user-supplied timeout to a sane range. Returns `fallback` when the
 * value is missing, non-numeric, or non-positive; otherwise the integer value
 * clamped up to `min`.
 */
export function resolveTimeoutMs(raw: unknown, fallback: number, min = MIN_TIMEOUT_MS): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }
  return Math.max(min, Math.floor(raw));
}

/** Configured timeout (ms) for the `json-schema-for-humans` render subprocess. */
export function getRenderTimeoutMs(): number {
  const cfg = vscode.workspace.getConfiguration('jsonschema.preview');
  return resolveTimeoutMs(cfg.get<number>('renderTimeout'), DEFAULT_RENDER_TIMEOUT_MS);
}

/** Configured timeout (ms) for outbound remote-schema HTTP fetches. */
export function getRemoteFetchTimeoutMs(): number {
  const cfg = vscode.workspace.getConfiguration('jsonschema');
  return resolveTimeoutMs(cfg.get<number>('remoteFetchTimeout'), DEFAULT_REMOTE_FETCH_TIMEOUT_MS);
}

/** Whether schema linting is enabled (F17-FR-03; default true). */
export function getLintEnabled(): boolean {
  const cfg = vscode.workspace.getConfiguration('jsonschema.lint');
  return cfg.get<boolean>('enabled') !== false;
}

/** Per-rule severity overrides for schema linting (F17-FR-03). */
export function getLintRuleSeverities(): Record<string, string> {
  const cfg = vscode.workspace.getConfiguration('jsonschema.lint');
  const rules = cfg.get<Record<string, string>>('rules');
  return rules && typeof rules === 'object' ? rules : {};
}

/** Automatic cache-revalidation policy (F08-FR-14). */
export type CacheAutoRefresh = 'off' | 'onOpen' | 'daily';

/**
 * Read the `jsonschema.cache.autoRefresh` setting, defaulting to `off` for any
 * missing or unrecognised value so an invalid config never enables background
 * network activity unexpectedly.
 */
export function getCacheAutoRefresh(): CacheAutoRefresh {
  const cfg = vscode.workspace.getConfiguration('jsonschema.cache');
  const value = cfg.get<string>('autoRefresh');
  return value === 'onOpen' || value === 'daily' ? value : 'off';
}
