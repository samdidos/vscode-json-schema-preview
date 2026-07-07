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

## Non-Functional Requirements

- **S08-NFR-01** The E2E job SHOULD finish in under 10 minutes; scenario
  count is bounded by the matrix above, not by porting the unit suite.
- **S08-NFR-02** E2E tests MUST NOT hit the network: remote-schema scenarios
  use a local HTTP fixture server, keeping runs deterministic and offline
  (S04, S05).

## Out of Scope

- UI pixel/screenshot assertions (the demo-GIF Playwright scripts remain a
  separate, non-test pipeline).
- Marketplace-install/packaging tests beyond loading the compiled extension.
- Replacing unit tests — pure-logic coverage stays in the mocked suite.

## Acceptance Criteria

1. `npm run test:integration` downloads VS Code, opens the multi-root
   fixture, and passes locally and in CI on Linux + Windows.
2. A deliberately reintroduced scope bug (e.g. dropping the resource argument
   from `findBoundSchemaPath`'s `getConfiguration`) fails at least one
   S08-SR-04 test.
3. `npm run check:traceability` counts `[ID]` tags found in E2E test titles.
4. CI shows the E2E job on PRs; its History note records when it became a
   required check.

## Relation to Existing Specs

- Verifies **F04/F10/F11** binding behaviour at the real-API layer; measures
  **S03** budgets; complements Article V unit coverage — `manual`-status
  requirements throughout the matrix become promotable once an E2E test tags
  them.
