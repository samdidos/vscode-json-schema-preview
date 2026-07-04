// Pure classification of a remote-schema fetch failure, used to decide whether
// to fall back to a stale local cache copy. See specs/S04-reliability.md.

export type FetchFailureKind = 'auth' | 'client' | 'transient';

interface MaybeHttp {
  name?: unknown;
  status?: unknown;
}

/**
 * Classify a thrown fetch error:
 *  - `auth`      HTTP 401/403 — credentials are needed; do not fall back.
 *  - `client`    other HTTP 4xx — the request itself is wrong (e.g. 404: the
 *                schema moved); the server is authoritative, so do not fall back.
 *  - `transient` HTTP 5xx, or a network-level failure with no HTTP status (DNS
 *                failure, connection refused, timeout, offline) — the endpoint
 *                is momentarily unreachable, so a cached copy may be used.
 */
export function classifyFetchFailure(err: unknown): FetchFailureKind {
  const e = (err ?? {}) as MaybeHttp;
  const status = typeof e.status === 'number' ? e.status : undefined;
  if (status === 401 || status === 403 || e.name === 'AuthRequiredError') {
    return 'auth';
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return 'client';
  }
  // 5xx and everything without an HTTP status (network-level) are transient.
  return 'transient';
}

/** Whether a failure of this kind permits a stale-cache fallback (S04-SR-01/04). */
export function shouldFallbackToCache(kind: FetchFailureKind): boolean {
  return kind === 'transient';
}

/**
 * Error carrying an HTTP status for non-auth, non-ok responses, so a failed
 * fetch can be classified by {@link classifyFetchFailure}.
 */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
