# S05 — Privacy and Data Collection

## Overview

The extension handles potentially sensitive material: private schema URLs,
authentication credentials, and the contents of user workspaces. These
requirements pin the extension's data-collection posture.

**Decision (2026-07-04):** zero telemetry. The extension collects nothing.

## Requirements

- **S05-SR-01** The extension MUST NOT collect, store, or transmit telemetry,
  usage analytics, or crash reports to any endpoint. There is no opt-in: the
  capability MUST NOT exist in the shipped code.
- **S05-SR-02** The only outbound network requests the extension makes MUST be
  fetches of schema URLs the user explicitly configured (via bindings, inline
  `$schema`, or the cache/refresh commands).
- **S05-SR-03** Schema contents, workspace file paths, and credentials MUST
  NOT be sent to any host other than the schema's own origin, and stored
  credentials MUST only be attached to requests to the host they were saved
  for (see [F07-auth.md](F07-auth.md)).

## Acceptance Criteria

1. A network capture during normal use (preview, validate, cache, refresh)
   shows requests only to the configured schema hosts.
2. The bundled extension source contains no telemetry SDK and no calls to
   analytics or crash-reporting endpoints.
