# F20 — Workspace Validation Report

## Overview

Every validation feature so far operates on the active editor, one file at a
time. This spec scales that to the whole workspace: a single command that
finds every data file with a schema binding (settings-based or inline),
validates each against its schema, lints every schema file (F17 rules), and
publishes the results as workspace diagnostics plus a summary report. This is
the "is my repo green?" button — and, run in CI-like fashion before a
release, it catches bindings that silently broke (wrong path, moved schema,
stale cache) which per-file UX only surfaces when someone happens to open the
file.

## User Stories

- As a maintainer of a repo with many bound config files, I want one command
  that validates all of them, so a broken binding doesn't hide until someone
  opens the file.
- As a schema author, I want every schema in the workspace linted in one
  pass, so quality issues are visible without opening each schema.
- As a reviewer, I want a summary (N files checked, M valid, K errors) I can
  paste into a PR comment.

## Functional Requirements

### Command & Discovery

- **F20-FR-01** A command `jsonschema.validateWorkspace` MUST be available
  whenever a workspace folder is open, and MUST run without any editor being
  active.
- **F20-FR-02** Discovery MUST find, across all workspace folders: (a) data
  files matched by `json.schemas` / `yaml.schemas` bindings at every settings
  scope this extension writes (Global, Workspace, WorkspaceFolder — resolved
  per folder in multi-root workspaces), and (b) JSON/YAML/TOML files with an
  inline `$schema` binding (F10/F11) — except when the `$schema` value is a
  JSON Schema meta-schema URI, which marks the file as a *schema* (c), not a
  data binding — and (c) schema files by the `*.schema.*` convention or a
  `$schema` declaration (F17's lintable set). A file can be both (b) and (c)
  (a bound data file that carries a `$schema` key): it is then both
  validated and linted.
- **F20-FR-03** Discovery MUST respect `files.exclude` and
  `search.exclude`, MUST skip files larger than a fixed size cap (1 MiB —
  S03 defines no shared byte cap, so this spec fixes its own), and MUST
  cap the total scanned file count (configurable, default 2000) with a
  truncation note in the report.

### Execution & Results

- **F20-FR-04** Each data file MUST be validated with the F03 pipeline
  (including F07 auth and F08 cache/offline fallback for remote schemas);
  each schema file MUST be linted with the F17 rule set. Files MUST be
  processed with bounded concurrency and failures isolated per file — one
  unreadable file MUST NOT abort the run.
- **F20-FR-05** Findings MUST be published to the Problems panel as
  diagnostics on their real file locations (creating them for unopened
  files), replacing any previous run's diagnostics; a schema that cannot be
  loaded at all MUST produce a diagnostic on the *binding* (the settings
  file line or the inline `$schema` line, located best-effort — falling
  back to the top of the data file when the binding line cannot be
  located), naming the unresolved reference.
- **F20-FR-06** The run MUST show cancellable progress (files completed /
  total) and MUST finish with a summary notification: files checked, valid,
  with errors, schemas linted, bindings that failed to resolve.
- **F20-FR-07** A "Copy report" action on the summary MUST produce a Markdown
  report (per-file status grouped by folder) suitable for pasting into a PR.
- **F20-FR-08** Re-running the command MUST first clear the previous run's
  diagnostics so removed problems disappear (no stale accumulation).
- **F20-FR-09** The sweep MUST additionally discover schema test suites
  (`*.schema.test.json`, F29), run each against its declared schema, and report
  failing cases as diagnostics on the suite file plus a suite section in the
  Markdown report. Suite counts (suites run, cases passed, cases failed) MUST
  appear in the summary, so one command answers "is my repo green?" for data
  files, schema quality **and** schema contracts.


## Non-Functional Requirements

- **F20-NFR-01** The orchestration (discovery filtering, result aggregation,
  report rendering) MUST be pure, unit-testable modules with ≥ 80 % coverage
  (Article V); only the thin command/progress wiring may be VS Code-bound.
- **F20-NFR-02** A 500-file workspace with cached schemas SHOULD complete in
  under 30 s on reference hardware (S03); remote fetches MUST reuse the F08
  cache so repeated runs do at most one conditional request per schema
  (F08-FR-14).
- **F20-NFR-03** In untrusted workspaces the command MUST follow S02's
  restrictions (no remote fetches; local-only validation with a notice in
  the summary).

## Out of Scope

- A CLI / headless mode for CI pipelines (would be a separate spec; the
  Markdown report is the interim CI story).
- Auto-fixing findings in bulk (F17 quick fixes stay per-file).
- Watching the workspace and re-validating continuously.

## Acceptance Criteria

1. In a multi-root workspace with a WorkspaceFolder-scope binding in folder A
   and an inline-bound TOML file in folder B, the command validates both and
   reports 2 files checked.
2. A data file bound to a schema path that no longer exists produces a
   diagnostic pointing at the binding, naming the missing path.
3. An invalid data file that is not open in any editor appears in the
   Problems panel at the correct line; fixing it and re-running clears it.
4. Cancelling mid-run stops within one file and leaves already-published
   diagnostics intact.
5. The copied Markdown report lists per-folder file counts and error lines.

## Relation to Existing Specs

- Orchestrates **F03** (validation), **F17** (linting), **F04/F10/F11**
  (binding discovery — all scopes, all languages), **F07/F08** (remote
  schema access), honouring **S02** (trust), **S03** (caps, cancellation),
  **S04** (offline fallback), **S05** (no telemetry).

## History

- **2026-09-02** — Added F20-FR-09: the sweep now discovers and runs schema test
  suites ([F29](F29-schema-tests.md)) alongside data files and schema lint, so
  one command answers "is my repo green?" for contracts too. Suite counts join
  the summary only when the workspace has suites, so a repo without them reads
  exactly as before.
