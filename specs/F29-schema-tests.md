# F29 — Schema Test Files

## Overview

Validation (F03) answers "is *this document* valid?"; coverage (F23) answers
"which parts of the schema does my data touch?". Neither answers the question a
schema *author* has: **"does my schema still accept what it should, and still
reject what it shouldn't?"** Today the only way to check that is to keep a
drawer of fixture files and validate them by hand.

This spec adds a small, declarative test format — a `*.schema.test.json` file
listing instances that MUST pass and instances that MUST fail — plus a runner
that executes it in the editor, in the workspace sweep (F20), and in CI through
the CLI (F27). It is the schema equivalent of a unit-test file: a schema change
that silently starts accepting garbage, or starts rejecting a document that
used to be fine, fails a test instead of being discovered in production.

This is deliberately *not* a general test framework: there is no code, no
assertions language, and no runner configuration — a suite is data, which is
what makes it reviewable in a pull request alongside the schema it guards.

## User Stories

- As a schema author, I want to pin the documents my schema must accept and
  must reject, so a later edit that breaks either one fails loudly.
- As a reviewer, I want a schema change's pull request to carry the cases it
  affects, so I can see the intent of the change rather than infer it.
- As a platform team, I want the same suites to run in CI without VS Code, so
  the contract is enforced on every merge.

## Suite Format

A suite is a JSON (or JSONC) document whose file name ends in
`.schema.test.json`:

```json
{
  "schema": "./person.schema.json",
  "description": "The person contract as consumed by the billing service.",
  "valid": [
    { "name": "minimal", "instance": { "name": "Ada" } },
    { "name": "from a fixture", "file": "./fixtures/ada.json" }
  ],
  "invalid": [
    { "name": "name is required", "instance": {}, "errors": ["required"] },
    { "name": "age must be a number", "instance": { "name": "A", "age": "x" } }
  ]
}
```

## Functional Requirements

### Parsing

- **F29-FR-01** A suite document MUST declare `schema` (a path or URL, resolved
  the same way a `$ref` is — F13's `refKind`) and MAY declare `description`.
  It MUST declare at least one of `valid` / `invalid`, each an array of cases.
- **F29-FR-02** A case MUST be either a **descriptor object** — one carrying an
  `instance` or a `file` key, plus optional `name` and (for `invalid` cases)
  `errors` — or, as shorthand, a **bare instance**, which is any other value.
  The presence of `instance`/`file` is the sole discriminator, so a bare
  instance that happens to be an object is never mistaken for a descriptor.
- **F29-FR-03** A case's reported name MUST be its `name` when present, else a
  positional label (`valid[0]`, `invalid[2]`). Names need not be unique.
- **F29-FR-04** The parser MUST be total: a malformed suite (not an object, no
  `schema`, a case list that is not an array, a descriptor with neither
  `instance` nor `file`) MUST yield a structured list of problems rather than
  throwing, and MUST report every problem it finds, not only the first.

### Running

- **F29-FR-05** The runner MUST validate each case's instance against the
  resolved schema using the draft-matching Ajv dialect (F03-FR-15), with
  `allErrors` enabled so an `invalid` case can be matched on more than the
  first failing keyword.
- **F29-FR-06** A `valid` case MUST pass when validation reports no errors, and
  fail otherwise, reporting the errors that were not expected.
- **F29-FR-07** An `invalid` case MUST pass when validation reports at least one
  error **and**, when the case declares `errors`, every declared keyword appears
  among the reported error keywords. A declared keyword that no reported error
  carries MUST fail the case and name the keywords that were actually reported,
  so a test cannot silently pass for the wrong reason.
- **F29-FR-08** A case whose `file` cannot be read, or whose instance cannot be
  parsed, MUST fail that case with an explanatory message and MUST NOT abort the
  rest of the suite.
- **F29-FR-14** A suite's `schema` and a case's `file` are paths taken from
  *document contents*, not from anything the user named, so resolving them MUST
  be confined: a path that resolves outside the workspace folder containing the
  suite MUST be refused and reported, never read. Without this a suite committed
  to a repository could name `../../../../etc/passwd` and have the extension
  read it, surfacing the content in a diagnostic. The containment check MUST be
  the same one the agent tools use for their file arguments (F33-FR-08).
- **F29-FR-09** The result MUST report per-case pass/fail plus suite totals
  (total, passed, failed), in declaration order.

### Surfaces

- **F29-FR-10** A command `jsonschema.runSchemaTests` MUST run the suite for the
  active suite file. When the active editor is a *schema* file, it MUST instead
  run every discovered suite whose `schema` resolves to that file, and report
  the aggregate.
- **F29-FR-11** Failing cases MUST surface as `Error`-severity diagnostics on
  the suite document, positioned on the failing case's own source span (located
  via F13's pointer locator against `/valid/<i>` or `/invalid/<i>`), and a run
  MUST replace the previous run's diagnostics rather than accumulate them.
- **F29-FR-12** The workspace sweep (F20) MUST discover `*.schema.test.json`
  files, run them, and include a suite section in its report and summary counts,
  so "is my repo green?" covers schema contracts as well as data files.
- **F29-FR-13** The CLI (F27) MUST expose `jstk test <suite...>`, exiting `0`
  when every case passes, `1` when any case fails, and `65` when a suite is
  malformed. `--json` MUST emit the machine-readable result.

## Non-Functional Requirements

- **F29-NFR-01** Parsing (`parseTestSuite`) and running (`runTestSuite`) MUST be
  pure, `vscode`-free modules with ≥ 80 % coverage (Article V). Reading a
  case's `file` is injected, so the runner performs no I/O of its own.
- **F29-NFR-02** The runner MUST NOT fetch anything. A suite whose `schema` is
  remote is resolved by its caller through the existing cache/credential path
  (F07/F08); the runner only ever sees an already-parsed schema.
- **F29-NFR-03** A suite MUST be inert to the rest of the extension: a
  `*.schema.test.json` file is neither a schema (F01) nor a bound data file
  (F03), so it MUST NOT be previewed, linted, or validated as one.

## Out of Scope

- Assertions beyond valid/invalid and error-keyword matching (no matching on
  messages, paths, or counts) — the format stays reviewable data.
- Generating suites from existing data — inference (F06) and coverage (F23)
  already cover the "start from data" direction.
- Watch mode / test-on-save. The sweep (F20) and CI (F27) are the automation
  points; an editor watcher is a future spec if it proves wanted.
- YAML suites. The format is JSON/JSONC only for now, mirroring F30's scope.

## Acceptance Criteria

1. A suite whose schema requires `name`, with `{"name":"Ada"}` under `valid`
   and `{}` under `invalid` with `errors: ["required"]`, reports 2 passed.
2. Changing that schema to make `name` optional turns the `invalid` case red
   with a message naming that no error was reported.
3. An `invalid` case declaring `errors: ["type"]` whose instance actually fails
   `required` fails, and the message names `required` as what was reported.
4. A suite missing `schema` reports a malformed-suite problem and runs nothing.
5. `jstk test suite.schema.test.json` exits 1 on a failing case and 0 when
   every case passes.

## Relation to Existing Specs

- **F03 (validation)** supplies the dialect-matching Ajv factory; a suite is
  validation run against fixed instances instead of the open editor.
- **F20 (workspace validation)** gains suites as a third checked artifact
  alongside data files and schema lint findings.
- **F26 (compatibility gate)** answers "is this change breaking?" structurally;
  F29 answers it empirically, on the documents a team actually cares about. The
  two are complementary and neither subsumes the other.
- **F27 (CLI)** exposes the runner headlessly for CI.

## History

- **2026-09-02** — Initial specification.
