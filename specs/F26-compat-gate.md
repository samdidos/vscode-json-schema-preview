# F26 — Backward-Compatibility Verdict & CI Gate

## Overview

F15 classifies every change between two schema versions as breaking /
non-breaking / informational / unclassified, but stops at *showing* the diff —
it explicitly deferred "CI enforcement" to a companion. This spec is that
companion. It turns the classification into a single **verdict** — "is the new
schema backward-compatible with documents valid under the old one?" — surfaces
that verdict in the diff command, and ships a headless CLI so the same check can
gate a pull request in CI (fail the build when a schema change would break
existing consumers).

## User Stories

- As a schema publisher, I want one yes/no answer — is this change safe to ship?
  — not a list I have to interpret every time.
- As a platform team, I want a CI step that fails a PR when a schema change is
  breaking, so an incompatible schema never merges by accident.
- As a reviewer, I want the diff's summary to lead with the verdict, so I judge
  compatibility before reading the details.

## Functional Requirements

### Verdict

- **F26-FR-01** A pure function MUST reduce a set of F15 `DiffEntry` values to a
  verdict: the per-kind counts and a boolean `compatible`. By default
  `compatible` is true exactly when there are **no breaking** changes.
- **F26-FR-02** A **strict** mode MUST additionally treat any **unclassified**
  change as incompatible (the classifier could not prove safety), so a strict CI
  gate errs on the side of caution.
- **F26-FR-03** The verdict MUST map to a process **exit code** for CI: `0` when
  compatible, `1` when breaking changes make it incompatible, and — in strict
  mode with no breaking changes but ≥ 1 unclassified change — a distinct `2`
  ("compatibility unknown"), so a pipeline can treat "unknown" differently from
  "breaking" if it wants.
- **F26-FR-04** A renderer MUST produce a report that leads with the verdict
  headline (e.g. `⛔ NOT backward-compatible — 2 breaking change(s)` or
  `✅ Backward-compatible`) followed by F15's grouped change list, conveying
  severity by text label, never colour alone (S06).

### Surfaces

- **F26-FR-05** The F15 diff command's summary notification MUST lead with the
  verdict verb (backward-compatible vs not), reusing the same pure verdict so
  the editor and CI never disagree.
- **F26-FR-06** A headless CLI (`scripts/schema-compat.mjs`, run via
  `npm run schema:compat -- <old> <new> [--strict] [--json]`) MUST compare two
  schema files (JSON/JSONC/YAML), print the verdict report (or JSON with
  `--json`), and exit with the F26-FR-03 code — reusing the same classifier and
  verdict modules as the extension, with no duplicated logic and no `vscode`
  import. It MUST print a usage message and exit non-zero on bad arguments or an
  unreadable/unparseable file.

## Non-Functional Requirements

- **F26-NFR-01** The verdict and report renderer (`schemaCompat`) MUST be a pure,
  `vscode`-free module with ≥ 80 % unit-test coverage (Article V), building only
  on F15's `schemaDiff`. The CLI wrapper is a thin entry script (like the other
  `scripts/*.mjs`), not unit-tested, and must add no new runtime dependency.
- **F26-NFR-02** The comparison MUST run in-process with no network or file
  access inside the pure module (the CLI does its own reads); it reuses F15's
  in-process classifier (S03) and never throws on malformed input — a parse
  failure is reported by the CLI as a non-zero exit, not a stack trace.

## Out of Scope

- Deep comparison across external `$ref` targets (bundle via F14 first) — the
  same limitation F15 documents.
- A hosted GitHub Action wrapper — the npm script is the CI primitive; wiring it
  into a specific workflow is the consumer's choice (an example is documented).
- Changing F15's classification rules; F26 only *aggregates* them.

## Acceptance Criteria

1. Adding a name to `required` yields a verdict with `compatible: false`, exit
   code `1`, and a report headline naming 1 breaking change.
2. Adding an optional property yields `compatible: true`, exit code `0`.
3. A change the classifier reports as unclassified yields exit `0` by default but
   exit `2` under `--strict`.
4. `npm run schema:compat -- old.json new.json` prints the verdict and exits with
   the matching code; a missing file prints usage/error and exits non-zero.
5. The diff command's notification leads with "backward-compatible" or "NOT
   backward-compatible", consistent with the CLI's verdict for the same pair.

## Relation to Existing Specs

- Directly extends **F15** (schema diff) — consumes its `DiffEntry` output and
  reuses `diffSchemas`/`renderReport`; this is the "CI enforcement" F15 listed as
  out of scope.
- Honours **S03** (in-process, no new latency/deps) and **S06** (text-first
  severity). **S05**: nothing leaves the machine; the CLI only reads the two
  files it is given.
