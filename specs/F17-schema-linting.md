# F17 — Schema Linting

## Overview

Quality diagnostics for schema files themselves (the extension already
validates *data* files in F03 — this lints the *schema*). Rules catch the
gaps that make schemas hard to consume as team contracts: missing
descriptions, unpinned drafts, misspelled keywords, permissive objects.
Diagnostics are in-process, debounced, and conservative by default (hints, not
warnings) so the feature informs without nagging.

## User Stories

- As a schema author, I want to be told which properties lack `description`s,
  so the rendered documentation (F01) is actually useful to readers.
- As a team lead, I want misspelled keywords (`requird`, `additionaProperties`)
  flagged, because JSON Schema silently ignores unknown keywords and the
  mistake ships.
- As a maintainer, I want to tune or disable individual rules per workspace.

## Functional Requirements

### Activation and Lifecycle

- **F17-FR-01** Linting MUST apply only to schema files, in `json`, `jsonc`,
  `yaml`, and `yml` documents. A document counts as a schema file when it is
  detected by F01-FR-02 (a `$schema` declaration) **or** its filename matches
  the `*.schema.{json,jsonc,yaml,yml}` convention. The filename fallback is
  required so `require-schema-declaration` (F17-FR-05) can fire on a
  schema-named file that is *missing* its `$schema` — which F01-FR-02 alone
  could never surface.
- **F17-FR-02** Diagnostics MUST refresh on open and on change (debounced,
  reusing the F02 debounce configuration pattern) and MUST be cleared when the
  document closes or stops being a schema.
- **F17-FR-03** A setting `jsonschema.lint.enabled` (default `true`) MUST
  gate the whole feature; `jsonschema.lint.rules` (object of
  `ruleId → "off" | "hint" | "info" | "warning"`) MUST override individual
  rule severities.

### Rules (initial set)

Each rule has a stable ID, reported as the diagnostic `code`. Default
severities in parentheses.

- **F17-FR-04** `no-unknown-keywords` (warning): a key that is not a valid
  keyword of the declared draft — nor inside `properties`/`$defs`/other
  keyword-value positions — MUST be flagged; the message SHOULD suggest the
  nearest known keyword for likely typos (edit distance 1–2).
- **F17-FR-05** `require-schema-declaration` (info): the root MUST declare
  `$schema`; when absent the diagnostic offers context on why drafts matter.
- **F17-FR-06** `require-root-id` (hint): the root SHOULD declare `$id` when
  the schema is referenced by other files.
- **F17-FR-07** `require-descriptions` (hint): the root and every named
  property SHOULD carry a non-empty `description` (or `title` at root).
- **F17-FR-08** `explicit-additional-properties` (hint): object subschemas
  with `properties` SHOULD state `additionalProperties` explicitly.
- **F17-FR-09** `no-duplicate-enum` (warning): `enum` arrays MUST NOT contain
  duplicate values (deep equality).
- **F17-FR-10** `no-empty-required` (warning): `required` MUST NOT list names
  absent from `properties` when `additionalProperties` is `false`.
- **F17-FR-11** Every diagnostic MUST carry the precise source range of the
  offending key/value (via `jsonc-parser` / YAML AST node positions), the rule
  ID as `code`, and severity per configuration.

### Quick Fixes

- **F17-FR-12** Code actions MUST be offered for: inserting a `$schema`
  declaration (QuickPick of drafts, 2020-12 first), inserting
  `"additionalProperties": false`, and de-duplicating an `enum`. Rules without
  a safe mechanical fix MUST NOT offer one.

## Non-Functional Requirements

- **F17-NFR-01** Linting MUST run in-process; a 500 KB schema SHOULD lint in
  under 200 ms. Rule evaluation MUST share one parse per document version.
- **F17-NFR-02** Each rule MUST be a pure function over the parsed AST with
  its own unit-test suite (positive, negative, and edge fixtures; ≥ 80 %
  coverage, Article V).
- **F17-NFR-03** Diagnostics MUST use a dedicated `DiagnosticCollection`
  (source: `json-schema-lint`) so they never mix with F03 data-validation
  diagnostics.

## Out of Scope

- Custom user-defined rules / Spectral ruleset compatibility (evaluate once
  the built-in set proves out).
- Auto-fix-on-save.
- Linting data files (F03's domain) or non-schema JSON.

## Acceptance Criteria

1. Opening a schema with `"requird": ["name"]` shows a warning suggesting
   `required`, positioned on the misspelled key.
2. A root without `$schema` shows an info diagnostic; its quick fix inserts a
   draft declaration chosen from a QuickPick.
3. Setting `jsonschema.lint.rules: { "require-descriptions": "off" }` removes
   those hints without affecting other rules.
4. `"enum": [1, 1, 2]` shows a warning; the quick fix leaves `[1, 2]`.
5. Diagnostics disappear when the `$schema` key is removed and the file stops
   being detected as a schema.

## Open Questions

- Q1 — Keyword tables per draft (04/06/07/2019-09/2020-12): maintain in-house
  constants vs. derive from Ajv's vocabularies. Leaning in-house constants
  (small, testable, no new dependency).

## Relation to Existing Specs

- Complements **F03** (data validation) — separate diagnostic source
  (F17-NFR-03).
- Reuses **F01-FR-02** schema detection and the **F02** debounce pattern.
- **S03**: debounced, in-process, single parse per version; **S06**: severity
  is conveyed by VS Code's standard diagnostic UI (not colour alone).
