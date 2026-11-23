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
- **F26-FR-07** The verdict MUST also be available **passively**, as a CodeLens
  on the schema document's first line reading the breaking-change count against
  the file's Git `HEAD` version (e.g. "2 breaking changes vs HEAD"), whose
  command opens the full report (F15). A schema with no Git baseline, or with no
  changes, MUST show no lens rather than an empty one. The lens MUST be governed
  by `jsonschema.compat.codeLens` (default `true`) and MUST compute from the
  same classifier as the command — never a second implementation.
- **F26-FR-08** Lens computation MUST NOT block typing: it MUST be debounced and
  MUST reuse the previous result while a recomputation is in flight.

### GitHub Action

- **F26-FR-09** The repository MUST ship a composite GitHub Action at
  `compat-gate/` (`uses: samdidos/vscode-json-schema-preview/compat-gate@<ref>`)
  that compares every schema file a push or pull request **changed** against
  its version at a base commit — by default the pull request's base, or the
  push's previous commit — and gates on the F26-FR-03 verdict. Schema files
  are selected by glob patterns (input `schemas`, default
  `**/*.schema.json`, `**/*.schema.yaml`, `**/*.schema.yml`); a renamed file
  is compared with its old path, and a newly added file is reported as new,
  not compared. A deleted schema file MUST count as breaking.
- **F26-FR-10** The action MUST fail the step when any compared file is
  breaking, and, with input `strict: true`, also when any is unclassified
  (F26-FR-02/03). It MUST write a job summary leading with the overall verdict,
  then one row per file, with each file's F26-FR-04 report, and set the output
  `verdict` to `compatible`, `breaking` or `unknown`.
- **F26-FR-11** The action MUST wrap the CLI's `diff --check` (F27) rather than
  reimplement any comparison, and MUST run the CLI built from the action's own
  ref, so a pinned action ref pins the classifier too and no package is
  downloaded from a registry at run time. Its glue MUST be a Node script with
  no dependency beyond Node and git (S15).

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
  same limitation F15 documents, tracked in
  [#249](https://github.com/samdidos/vscode-json-schema-preview/issues/249).
- Publishing the action to the GitHub Marketplace (a release step), and
  comparing schemas that changed only through a referenced file (#249).
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

## History

- **2026-09-02** — Added F26-FR-07/08: the verdict as a passive CodeLens on the
  schema's first line, counting breaking changes against Git `HEAD`. Debounced
  and computed in the background from the same classifier as the command, so
  typing is never blocked; no baseline or no changes means no lens rather than an
  empty one.

- **2026-11-23** — Added F26-FR-09..11: a composite GitHub Action that gates a
  pull request on the schemas it changed (#250), moving the hosted-action
  wrapper out of Out of Scope. It builds the CLI from its own ref instead of
  downloading the npm package, which also keeps it working before the CLI is
  first published (#286).
