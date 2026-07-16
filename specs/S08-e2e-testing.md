# S08 — End-to-End Testing

## Overview

The unit suite runs against a **mocked** `vscode` module. The mock's
`getConfiguration().inspect()` returns the *same value for every settings
layer* and ignores resource scoping entirely, so an entire class of real bug —
wrong `ConfigurationTarget`, folder-scoped settings in multi-root workspaces,
path-prefix mismatches between what a binding writes and what a reader
matches — passes the unit suite by construction. The multi-root binding bugs
found in mid-2026 (F04-FR-13 and the `findBoundSchemaPath` scope/prefix
mismatches) are exactly this class. The Playwright scripts under
`src/test/e2e/` do not cover it either: they are demo-GIF *recordings*
(screenshots, no assertions) that only run in the GIF-refresh workflow.

This spec adds a real end-to-end suite that runs the packaged extension in an
actual VS Code instance (`@vscode/test-electron`), against real settings
files, real multi-root workspaces, and the real filesystem — the layer where
the mock necessarily lies.

## Requirements

### Harness

- **S08-SR-01** An E2E suite MUST run the extension in a downloaded, real
  VS Code build via `@vscode/test-electron` (`npm run test:integration`),
  driving it through the `vscode` API from an extension-host test runner (no
  UI scripting required). It MUST be runnable headless in CI (xvfb).
- **S08-SR-02** Fixtures MUST include at least: a single-folder workspace, a
  **multi-root** workspace (≥ 2 folders with distinct `.vscode/settings.json`
  files), and data/schema files in JSON, YAML, and TOML.
- **S08-SR-03** E2E tests MUST use the same mocha `tdd` interface and
  requirement-tag convention as unit tests; a `[ID]` tag in an E2E test title
  MUST count as test coverage in `npm run check:traceability`, so `manual`
  requirements verified by an E2E test can be promoted to `implemented`.

### Mandatory Scenarios

- **S08-SR-04** Settings-scope round-trips MUST be covered as a matrix: for
  each of Global / Workspace / WorkspaceFolder × JSON / YAML, bind a schema,
  then assert (a) the entry landed in the *correct* settings file with the
  *correct* path form, and (b) the extension's own readers
  (`findBoundSchemaPath` → status bar, validator) see the binding — in both
  single-folder and multi-root fixtures, including the cross-folder case
  (schema in folder A, data file in folder B).
- **S08-SR-05** Inline-binding round-trips MUST be covered for JSON, YAML,
  and TOML: bind, assert the document text, validate, remove, assert clean —
  including a TOML file whose first content is a `[table]` header and a
  schema path containing characters that require escaping in the target
  syntax.
- **S08-SR-06** One smoke test per user-facing command in
  `package.json#contributes.commands` MUST at minimum execute the command
  against a fixture and assert it neither throws nor leaves an error
  notification.
- **S08-SR-07** The S03 startup/perf budgets (e.g. S03-SR-13's p95 command
  latency) MUST be measured in the E2E run and reported, so `planned`
  performance requirements can be promoted with real numbers.

### CI Integration

- **S08-SR-08** The E2E suite MUST run in CI on every PR (own job, may be
  slower than unit tests). It MAY start non-blocking while flakiness is
  measured, but MUST be promoted to a required check once it has run clean
  for 2 consecutive weeks; the promotion MUST be recorded in this spec's
  History.
- **S08-SR-09** The suite MUST run on both Linux and **Windows** runners —
  path-separator and drive-letter handling (absolute paths embedded by
  F04-FR-13/F10-FR-05, TOML string escaping) are platform bugs the unit
  suite cannot catch on Linux alone.

### UI smoke (Playwright demo scripts)

The `src/test/e2e/` Playwright scripts capture screenshot frames for the demo
GIFs and contain no assertions, so historically they ran only in the
GIF-refresh workflow. They come in two variants per feature: a **mouse** twin
(`demo-<x>-mouse`, animated cursor — the frames the GIF pipeline consumes) and a
**command-palette** twin (`demo-<x>`, no mouse — whose frames the GIF pipeline
does **not** consume). The command-palette twins are otherwise wasted effort,
yet they exercise the real feature flow through the actual VS Code UI, so they
have value as a lightweight UI **smoke** signal the assertion-based integration
suite (API-level) does not provide.

- **S08-SR-10** The command-palette (non-mouse) demo scripts MUST run as a
  UI-smoke job (Playwright launching real VS Code, headless via xvfb), passing
  when each demo flow completes without throwing or timing out — i.e. crash /
  broken-selector detection, not pixel assertions. It runs at **release time**
  (the GIF-refresh workflow, `on: workflow_run` after Release Please), not on
  every PR/push — see the History note on why — as a job parallel to (not
  dependent on) the GIF-refresh job, so neither lengthens the other's critical
  path. It MUST start **non-blocking** (`continue-on-error`) like the
  integration job (S08-SR-08) while flakiness is measured.
- **S08-SR-11** The mouse demo scripts MUST NOT run in the smoke job, and the
  GIF-refresh workflow's `refresh-gifs` job MUST run **only** the mouse scripts
  (the non-mouse frames it never consumes) — so each Playwright variant runs in
  exactly one place: mouse → GIFs, non-mouse → smoke. The split is by
  test-title grep on `mouse`, which every mouse test title contains and no
  non-mouse title does.

### Harness notes (implementation)

- The `toml` language id and the `yaml.schemas` configuration key are not
  provided by any bundled VS Code extension (they normally come from the
  marketplace extensions `tamasfe.even-better-toml` and `redhat.vscode-yaml`).
  A **contribution-only fixture extension**
  (`src/test/integration/fixtures/test-lang-support`) declares both and is
  loaded via `extensionDevelopmentPath` — which is honoured even under
  `--disable-extensions` — so `.toml` files get a real language id and
  folder/workspace/user-scoped `yaml.schemas` writes succeed, all without a
  marketplace `--install-extension` step (satisfying S08-NFR-02 and avoiding
  the Windows `.cmd` spawn pitfalls that step brings). Because
  `redhat.vscode-yaml` itself is absent, inline YAML binding writes the plain
  `$schema:` key form rather than the `# yaml-language-server:` directive
  (F10-FR-09).
- Fixture schemas use **draft-07** (`http://json-schema.org/draft-07/schema#`):
  the extension's validator uses Ajv's default export, which bundles draft-07
  and does not know the draft 2020-12 meta-schema. This is also why the
  validator must parse YAML-format schema files (F03-FR-14) — the `schema.yaml`
  fixture proved `loadSchema` was JSON-only, an inconsistency with the other
  schema consumers that S08 was built to surface.

## Non-Functional Requirements

- **S08-NFR-01** The E2E job SHOULD finish in under 10 minutes; scenario
  count is bounded by the matrix above, not by porting the unit suite.
- **S08-NFR-02** E2E tests MUST NOT hit the network: remote-schema scenarios
  use a local HTTP fixture server, keeping runs deterministic and offline
  (S04, S05).

## Out of Scope

- UI **pixel/screenshot** assertions. The mouse demo scripts remain a
  screenshot-only pipeline; the non-mouse twins are promoted to a *crash-level*
  smoke signal only (S08-SR-10), not visual assertions.
- Marketplace-install/packaging tests beyond loading the compiled extension.
- Replacing unit tests — pure-logic coverage stays in the mocked suite.

## Acceptance Criteria

1. `npm run test:integration` downloads VS Code, opens the multi-root
   fixture, and passes locally and in CI on Linux + Windows.
2. A deliberately reintroduced scope bug (e.g. dropping the resource argument
   from `findBoundSchemaPath`'s `getConfiguration`) fails at least one
   S08-SR-04 test.
3. `npm run check:traceability` counts `[ID]` tags found in E2E test titles.
4. CI shows the E2E integration job (S08-SR-08) on PRs; its History note
   records when it became a required check. The UI-smoke job (S08-SR-10) shows
   on the "Refresh Demo GIFs" workflow run instead, per the History note below.

## Relation to Existing Specs

- Verifies **F04/F10/F11** binding behaviour at the real-API layer; measures
  **S03** budgets; complements Article V unit coverage — `manual`-status
  requirements throughout the matrix become promotable once an E2E test tags
  them.

## History

- **2026-07** — S08-SR-10's UI-smoke job moved from `ci.yml` (every PR/push) to
  `refresh-gifs.yml` (release time, parallel to the GIF-refresh job it shares
  fixtures with). Running on every PR meant it contended for shared runner
  capacity alongside a dozen other concurrent jobs, and made the per-PR CI run
  noticeably slower for a job that gates nothing. The integration job
  (S08-SR-08/09) is unaffected and still runs on every PR.
- **2026-07** — Two demos (`demo-migrate`/`demo-migrate-mouse`,
  `demo-quickfix`/`demo-quickfix-mouse`) reproducibly timed out opening their
  seeded fixture via Quick Open (`Ctrl+P`), on independent runner VMs across
  multiple runs — a real, repeatable issue with Quick Open's async
  file-search for those specific fixtures, not the runner-contention
  flakiness the previous entry blamed it on (that diagnosis was wrong: two
  isolated VMs hitting the identical failure rules out shared-resource
  contention as the cause). Fixed by opening the seeded file via VS Code's own
  CLI launch arguments (`runDemo`'s `openFiles` parameter) instead of driving
  Quick Open at all — sidesteps the flaky code path entirely rather than
  tuning it further. The other 12 demos, whose Quick Open opens are reliable,
  are unchanged.
