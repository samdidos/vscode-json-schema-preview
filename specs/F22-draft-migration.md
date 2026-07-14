# F22 — Draft Migration

## Overview

JSON Schema has evolved across drafts, and the differences are mechanical but
tedious to apply by hand: `definitions` became `$defs`, tuple `items` became
`prefixItems`, `dependencies` split into `dependentRequired` /
`dependentSchemas`, draft-04's boolean `exclusiveMinimum` became a number, and
`id` became `$id`. This feature migrates a schema between drafts
(**draft-07 ↔ 2019-09 ↔ 2020-12**), rewriting the well-known keyword changes and
reporting exactly what it changed — leaving anything it cannot safely transform
untouched (the same conservative stance as F15's `unclassified`).

## User Stories

- As a schema maintainer, I want to upgrade an old draft-07 schema to 2020-12
  in one command, and see a list of every keyword that changed.
- As a library author who must support an older validator, I want to downgrade a
  2020-12 schema to draft-07 and be told which constructs could not be
  represented, rather than getting a silently-wrong result.

## Functional Requirements

### Migration transform (pure)

- **F22-FR-01** A pure module MUST transform a parsed schema to a target draft
  (`2020-12` | `2019-09` | `draft-07`) and return both the new schema and an
  ordered list of changes (each a JSON-Pointer-ish path + a human description).
  It MUST be free of the `vscode` module and MUST NOT mutate its input.
- **F22-FR-02** The root `$schema` MUST be set to the target draft's canonical
  meta-schema URI.
- **F22-FR-03** `id` MUST be renamed to `$id` when `$id` is absent (draft-04
  modernisation), applied at every schema node, not only the root.
- **F22-FR-04** A boolean `exclusiveMinimum`/`exclusiveMaximum` (draft-04) MUST
  be converted to the draft-06+ numeric form: `{minimum: n, exclusiveMinimum:
  true}` → `{exclusiveMinimum: n}`; a `false` boolean MUST simply be dropped.
- **F22-FR-05** Definition containers MUST be renamed to match the target:
  `definitions` → `$defs` when the target is 2019-09 or 2020-12; `$defs` →
  `definitions` when the target is draft-07. Local `$ref` pointers MUST be
  rewritten to match (`#/definitions/…` ↔ `#/$defs/…`).
- **F22-FR-06** Array (tuple) `items` MUST be converted for the target: to
  2020-12, an array `items` becomes `prefixItems` and any `additionalItems`
  becomes `items`; to draft-07/2019-09, `prefixItems` becomes array `items` and
  a sibling schema `items` becomes `additionalItems`.
- **F22-FR-07** `dependencies` MUST be split for 2019-09+: entries whose value is
  an array of names become `dependentRequired`, entries whose value is a schema
  become `dependentSchemas`. For draft-07 the two MUST be merged back into
  `dependencies`.
- **F22-FR-08** Transformation MUST recurse through every subschema position
  (`properties`, `patternProperties`, `$defs`/`definitions`,
  `dependentSchemas`, `items`/`prefixItems`, `additionalProperties`/
  `additionalItems`/`unevaluated*`, `allOf`/`anyOf`/`oneOf`, `not`/`if`/`then`/
  `else`/`contains`/`propertyNames`).
- **F22-FR-09** A migration that changes nothing MUST return an empty change
  list, so the command can report "already conforms" rather than opening an
  identical copy.

### Command (VS Code)

- **F22-FR-10** A command `jsonschema.migrateDraft` MUST be offered on JSON
  Schema files (gated by F01-FR-02 detection, the same gate the diff/generate
  commands use) via the command palette and the editor title bar.
- **F22-FR-11** The command MUST prompt for the target draft, run the transform,
  and open the migrated schema in a new editor beside the source (JSON output
  for JSON/JSONC sources, YAML output for YAML sources), leaving the original
  file untouched — mirroring the sample-data / generate-types commands.
- **F22-FR-12** The command MUST report the change count (and surface the "no
  changes" case), and MUST surface an unparsable source as an error rather than
  producing partial output.

## Non-Functional Requirements

- **F22-NFR-01** The transform MUST run in-process with no network or filesystem
  I/O.
- **F22-NFR-02** The pure transform MUST have its own unit-test suite covering
  each keyword transform in both directions plus idempotence (migrating to the
  draft a schema already declares is a no-op); ≥ 80 % coverage (Article V).

## Out of Scope

- `$recursiveRef`/`$recursiveAnchor` ↔ `$dynamicRef`/`$dynamicAnchor`
  conversion — the 2019-09 and 2020-12 semantics differ enough that an automatic
  rewrite would be lossy; these are left untouched (a change note MAY advise
  manual review in a later revision).
- Draft-04/06 as *targets* (only as recognised legacy *sources* via FR-03/04).
- Format-vocabulary / `$vocabulary` declaration management.
- In-place rewriting of the source file (output is always a new editor).
- Semantic validation that the migrated schema still means the same thing —
  this is a keyword transform, not a solver.

## Acceptance Criteria

1. Migrating `{ "definitions": { "X": {} }, "properties": { "a": { "$ref":
   "#/definitions/X" } } }` to 2020-12 yields `$defs` and a rewritten `$ref`
   `#/$defs/X`, and sets `$schema` to the 2020-12 meta-schema.
2. Migrating `{ "items": [ { "type": "string" } ], "additionalItems": { "type":
   "number" } }` to 2020-12 yields `prefixItems` + `items`; the reverse
   round-trips to draft-07.
3. Migrating `{ "minimum": 0, "exclusiveMinimum": true }` to draft-07 yields
   `{ "exclusiveMinimum": 0 }`.
4. Migrating `{ "dependencies": { "a": ["b"], "c": { "required": ["d"] } } }` to
   2019-09 yields `dependentRequired: { a: ["b"] }` and `dependentSchemas: { c:
   … }`; the reverse merges them back.
5. Migrating a schema already declaring the target draft, with no legacy
   keywords, returns zero changes.

## Relation to Existing Specs

- Reuses **F03-FR-15**'s `draftOf`/draft model and **F13**'s schema parsing.
- Complements **F15** (diff) — diff tells you *what* changed between two
  schemas; migration *produces* the changed schema for a new draft.
- **S03**: in-process, no I/O; conservative like **F15-FR-08** (never silently
  transforms what it cannot represent).
