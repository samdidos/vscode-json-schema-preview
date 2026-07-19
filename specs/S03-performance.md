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
- **S03-SR-14** The render-subprocess and remote-fetch timeouts MUST be
  user-configurable via `jsonschema.preview.renderTimeout` and
  `jsonschema.remoteFetchTimeout` respectively. A configured value that is
  missing, non-numeric, or non-positive MUST fall back to the SR-11/SR-12
  default; any valid value MUST be clamped to a minimum of 1000 ms so a
  mistyped tiny value cannot make every render fail instantly.

### Build Size Budgets

A large or steadily-growing bundle slows down every user's install and
extension-host activation, regardless of the runtime timeouts above.
`dist/extension.js` is the **activation bundle** — the code the extension host
loads on every activation; lazily-loaded webpack chunks (`dist/chunk-*.js`,
e.g. the quicktype-core code-generation engine) load on first use only and
count toward the `.vsix` budget, not the activation budget. Budgets sized
with roughly 50-60% headroom over the measured baseline (2026-07-19:
production `dist/extension.js` ~0.40 MB after splitting quicktype-core out;
packaged `.vsix` ~0.75 MB) so routine dependency growth doesn't trip the
gate, while still catching an accidental large dependency, an un-excluded
dev-only tree shipped into the package, or a heavy module regressing into
the activation path.

- **S03-SR-15** A script MUST measure, on every CI build, (a) the production
  webpack activation bundle (`dist/extension.js`, built via `npm run package`)
  and (b) the packaged `.vsix` produced by `vsce package --no-dependencies`,
  and MUST fail (non-zero exit) if either exceeds its budget in S03-SR-16.
- **S03-SR-16** Budgets: `dist/extension.js` MUST NOT exceed **1 MB**; the
  packaged `.vsix` MUST NOT exceed **1.5 MB**. A run that exceeds 85% of
  either budget MUST print a warning (non-fatal) so creeping growth is visible
  in CI logs before it becomes a hard failure.
- **S03-SR-17** `.vscodeignore` MUST exclude every file/directory that is not
  needed at extension runtime (specs, spec-kit tooling, git hooks, alternate
  tsconfigs, lint/test/release config, project meta-docs) so the packaging
  step in S03-SR-15 measures — and ships — only what the extension host
  actually loads.
- **S03-SR-18** The measurement in S03-SR-15 MUST be written to a committed,
  version-controlled snapshot file (`bundle-size.json`, at the repo root,
  excluded from the `.vsix` itself per S03-SR-17) each time it runs, so the
  size trend over time is inspectable via that file's git history — the same
  pattern `maturity-score.json` uses for the maturity score. A scheduled
  workflow MUST refresh this snapshot regularly (independent of whether any
  PR happened to trip the budget) so the tracked history doesn't go stale
  between size-relevant changes.

## Acceptance Criteria

1. Closing the preview panel while a live-update is pending produces no error
   and no orphaned Python process.
2. Opening the **Output** panel and selecting "JSON Schema Preview" shows
   structured log output from the extension.
3. With no configuration override, a hung Python render or remote fetch is
   killed/aborted after 30 s and an error page is shown.
4. `npm run check:bundle-size` (run after `npm run package`) exits non-zero
   and names the offending artifact when either the production bundle or the
   packaged `.vsix` exceeds its S03-SR-16 budget.
5. `bundle-size.json`'s `git log -p` shows one entry per refresh, so the size
   trend over releases is readable without re-running the build.

## History

- 2026-07-19 — quicktype-core moved out of the activation bundle into a lazy
  webpack chunk; `dist/extension.js` dropped ~1.91 MB → ~0.40 MB, and the
  S03-SR-16 activation-bundle budget was tightened 3 MB → 1 MB to lock the
  win in (the `.vsix` budget is unchanged — the chunk still ships).
