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
- **S05-SR-04** S05-SR-02's rule admits exactly one further class of outbound
  request: a **user-initiated language model request** made through the editor's
  own Language Model API, and only when the user has explicitly enabled AI
  assistance (off by default). The extension MUST NOT contact a model provider
  directly, MUST NOT hold provider credentials, and MUST NOT send anything
  beyond the artifacts the invoked command operates on. The full constraints —
  opt-in, user initiation, what may be sent, and verification of what comes
  back — are specified in [S20-ai-assistance.md](S20-ai-assistance.md).
  S05-SR-01 (zero telemetry) is unaffected and remains unconditional: no usage
  data, analytics, or crash reports are sent to anyone, a model included.

## Acceptance Criteria

1. A network capture during normal use (preview, validate, cache, refresh)
   shows requests only to the configured schema hosts.
2. The bundled extension source contains no telemetry SDK and no calls to
   analytics or crash-reporting endpoints.

## History

- **2026-09-02** — Added S05-SR-04: a single, explicitly bounded carve-out to
  S05-SR-02 for **user-initiated language model requests** through the editor's
  own Language Model API, gated behind a setting that defaults to off. The
  extension still contacts no model provider directly and holds no provider
  credential; what may be sent is bounded by
  [S20-ai-assistance.md](S20-ai-assistance.md). S05-SR-01 (zero telemetry) is
  unchanged and remains unconditional — no usage data reaches anyone, a model
  included.
