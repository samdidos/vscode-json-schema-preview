# S04 — Reliability and Offline Behaviour

## Overview

Remote schemas can become unreachable at any time: the machine is offline, DNS
fails, the endpoint times out, or the server returns a 5xx. These requirements
define how the extension degrades in that situation.

**Decision (2026-07-04):** the extension favours availability — when a remote
schema cannot be fetched and a local cached copy exists (see
[F08-schema-cache.md](F08-schema-cache.md)), it falls back to the stale copy
and warns, rather than failing hard.

## Requirements

### Stale-Cache Fallback

- **S04-SR-01** When a remote schema fetch fails for a transient reason
  (network unreachable, DNS failure, timeout, HTTP 5xx) and a locally cached
  copy of that schema exists, the extension MUST fall back to the cached copy
  for validation and preview.
- **S04-SR-02** The fallback MUST be announced with a non-blocking warning
  (status bar item or warning notification) stating that a stale cached copy
  is in use. It MUST NOT be presented as a modal error.
- **S04-SR-03** If no cached copy exists, the extension MUST show an
  actionable error offering next steps: **Cache Schema Locally**, and on
  401/403 **Configure Auth** (per F08-FR-11).

### Failure Semantics

- **S04-SR-04** HTTP 4xx client errors other than 401/403 MUST NOT trigger the
  stale-cache fallback — the server is authoritative that the request itself
  is wrong (e.g. 404: the schema moved). These MUST surface as errors.
- **S04-SR-05** A failed fetch MUST NOT leave a preview panel or the
  validation state broken, and the extension MUST NOT retry automatically in
  a loop. A retry happens on the next user-initiated action or debounced
  live-update cycle.

## Acceptance Criteria

1. With a schema cached locally, going offline and re-validating the bound
   data file still produces diagnostics, plus a stale-cache warning.
2. With no cached copy, the same scenario produces one actionable error and
   no repeated background retries.
3. A 404 on the remote schema is reported as an error even when a cached copy
   exists.
