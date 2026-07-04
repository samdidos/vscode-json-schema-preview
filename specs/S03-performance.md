# S03 — Performance and Resource Management

## Overview

The extension interacts with long-running processes (Python subprocess, remote
HTTP fetches) and creates persistent webview panels. These requirements govern
timeouts, cleanup, and async behaviour.

## Requirements

### Python Subprocess

- **S03-SR-01** The `json-schema-for-humans` invocation MUST be asynchronous;
  it MUST NOT block the VS Code extension host event loop.
- **S03-SR-02** The subprocess MUST have a configurable timeout; if it exceeds
  the timeout the process MUST be killed and an error page MUST be shown.

### Remote Fetch

- **S03-SR-03** All outbound HTTP requests for remote schemas MUST carry an
  explicit timeout (via `AbortSignal` or equivalent) to prevent the UI from
  hanging on unreachable endpoints.

### Webview Lifecycle

- **S03-SR-04** When a preview panel is disposed the extension MUST remove it
  from the `openJsonSchemaFiles` map and delete its entry from `rawOutputCache`.
- **S03-SR-05** The extension MUST track all created webview panels in
  `context.subscriptions` (or equivalent) so they are disposed when the
  extension deactivates.
- **S03-SR-06** `deactivate()` MUST call `disposeAllPanels()` to release all
  open webview panels.

### Schema Discovery

- **S03-SR-07** Workspace schema file discovery (for the binding Quick Pick)
  MUST be performed asynchronously using `vscode.workspace.findFiles` so it
  does not block the UI while scanning large workspaces.

### Debounce Timer Cleanup

- **S03-SR-08** Live-update debounce timers MUST be cleared when the associated
  preview panel is disposed to prevent stale Python invocations after the panel
  is closed.

### Logging

- **S03-SR-09** The extension MUST create a dedicated `LogOutputChannel` named
  `"JSON Schema Preview"` and route all diagnostic output to it.
- **S03-SR-10** The extension MUST NOT call `console.log` / `console.error` in
  production code; all logging MUST go through the `LogOutputChannel`.

### Performance Budgets

Concrete budgets decided 2026-07-04. The debounce delay budget lives in
F02-FR-04 (default 1500 ms, minimum 500 ms) and is not restated here.

- **S03-SR-11** The `json-schema-for-humans` render subprocess MUST default to
  a 30 000 ms timeout; auxiliary CLI captures (e.g. interpreter/version
  probes) MUST default to 10 000 ms.
- **S03-SR-12** Remote schema HTTP fetches MUST default to a 30 000 ms
  timeout.
- **S03-SR-13** Preview generation SHOULD complete within 2 s (p95) for
  schema files up to 500 KB on typical developer hardware. Slower renders are
  not an error, but SHOULD be treated as performance regressions and
  investigated.

## Acceptance Criteria

1. Closing the preview panel while a live-update is pending produces no error
   and no orphaned Python process.
2. Opening the **Output** panel and selecting "JSON Schema Preview" shows
   structured log output from the extension.
3. With no configuration override, a hung Python render or remote fetch is
   killed/aborted after 30 s and an error page is shown.
