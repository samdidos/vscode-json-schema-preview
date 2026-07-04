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
