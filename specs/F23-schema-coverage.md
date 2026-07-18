# F23 — Schema Coverage (unused-in-data lens)

## Overview

Validation (F03) answers "is this data valid against the schema?". This spec
answers the mirror question: "which parts of the schema does my data actually
exercise?". Given a data file and its bound schema, it computes which
schema-declared properties never appear in the data and highlights them — a
coverage lens over a schema, the natural sibling of F20's workspace validation.
It surfaces dead or aspirational schema surface (properties nothing populates),
optional fields a fixture forgot, and drift between a schema and the shape of
real documents.

## User Stories

- As a config author, I want to see which schema options my example config
  never sets, so I can trim dead schema surface or add missing examples.
- As a schema author, I want a coverage number for a representative data file,
  so I can tell how much of the contract my fixtures actually touch.
- As a reviewer, I want the unused properties highlighted on the schema itself,
  so I can see the gaps where I read the schema.

## Functional Requirements

### Command & Resolution

- **F23-FR-01** A command `jsonschema.schemaCoverage` MUST be available when the
  active editor is a supported data file (JSON/JSONC/JSONL/YAML/TOML — F03/F11).
- **F23-FR-02** The command MUST resolve the data file's schema from, in order,
  its inline `$schema` (F10/F11) then a settings binding (F04); when none
  resolves it MUST show an actionable notice and stop. A remote schema that is
  not cached locally (F08) MUST offer to cache it rather than fetching inline.
- **F23-FR-03** For a JSONL data file every record MUST be treated as a separate
  instance and coverage MUST be the union across records (a property is
  exercised if it appears in any record).

### Coverage Computation

- **F23-FR-04** The analyser MUST collect the set of properties the schema
  *declares* — every named entry under `properties`, recursing through nested
  object schemas, array `items`, the `allOf`/`anyOf`/`oneOf` branches, and
  same-document `$ref` targets (`$defs`/`definitions`), guarding against
  reference cycles. Each declared property is keyed by its data-space path
  (dotted, with `[]` for array descent, e.g. `address.street`, `items[].tag`).
- **F23-FR-05** The analyser MUST collect the set of property paths *present* in
  the data (array indices collapsed to `[]`), and MUST classify each declared
  property as **exercised** when its path is present in any instance, or
  **unexercised** otherwise.
- **F23-FR-06** The result MUST report a total, an exercised/unexercised split,
  and a coverage percentage (100 % when the schema declares no properties). The
  analyser MUST be pure (no `vscode` import) and MUST NOT throw on malformed
  schema or data — an unparsable input yields an empty, safe result the command
  reports as a notice.

### Highlighting & Report

- **F23-FR-07** When the resolved schema is a local file, each unexercised
  property MUST be highlighted on the schema document as an `Information`-severity
  diagnostic on the property definition's source span (located via F13's pointer
  locator), tagged `Unnecessary` so editors can dim it. Re-running MUST replace
  the previous run's coverage diagnostics (no stale accumulation).
- **F23-FR-08** The command MUST finish with a summary notification (exercised /
  total, percentage) offering a "Copy report" action that produces a Markdown
  report listing the unexercised property paths, suitable for pasting into a PR.

## Non-Functional Requirements

- **F23-NFR-01** The analyser (`collectSchemaProperties`, `collectDataPaths`,
  `computeCoverage`, `renderCoverageReport`) MUST be pure, unit-tested modules
  with ≥ 80 % coverage (Article V); only the thin command/diagnostic wiring may
  be VS Code-bound. Property-based tests with `fast-check` (never throws on
  arbitrary JSON pairs) are RECOMMENDED.
- **F23-NFR-02** Coverage is a **heuristic presence** analysis, not a validation:
  it does not resolve remote `$ref`, evaluate conditional applicability
  (`if`/`then`, `dependentSchemas`), or reason about `patternProperties`/
  `additionalProperties` beyond named properties. The report MUST state this so
  an unexercised entry is read as "worth a look", not "provably dead".

## Out of Scope

- Whole-workspace coverage aggregation across many data files (F20 owns
  discovery; this command measures the active file, or the active file's
  records for JSONL).
- Value/enum coverage (which enum members are used) — that is F25's territory.
- Coverage of `required` vs optional distinctions, or branch (`oneOf`) selection
  coverage.

## Acceptance Criteria

1. A data file `{ "a": 1 }` bound to a schema declaring properties `a` and `b`
   reports 50 % coverage and one unexercised property `b`.
2. Running the command on that data file places one `Information` diagnostic,
   tagged `Unnecessary`, on `b`'s definition line in the schema file; re-running
   after adding `b` to the data clears it.
3. A JSONL file whose records collectively populate every declared property
   reports 100 % and opens no diagnostics.
4. A schema with a nested object and an array of objects reports unexercised
   nested paths using `parent.child` / `items[].field` notation.
5. The copied Markdown report lists each unexercised path and states the
   heuristic caveat.

## Relation to Existing Specs

- Sibling of **F20** (workspace validation) — same "measure my repo" family, but
  the inverse question (unused schema surface, not invalid data).
- Reuses **F13**'s pointer locator (`locatePointerTarget`) to place highlights,
  **F10/F11/F04** for binding resolution, and **F08** for cached remote schemas.
- Honours **S02** (no remote fetch in untrusted workspaces — cached/local only)
  and **S05** (no telemetry; data never leaves the machine).
