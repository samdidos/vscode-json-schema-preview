# F16 — Sample Data Generation

## Overview

The inverse of inference (F06): generate a valid example instance *from* a
schema. Useful for seeding test fixtures, trying out a schema right after
binding it, and understanding what a (possibly private) schema actually
describes. Generation is deterministic by default so repeated runs produce
stable fixtures suitable for committing.

## User Stories

- As a developer who just bound a schema, I want a valid starter document
  generated for me, so I don't hand-type boilerplate to satisfy `required`.
- As a tester, I want deterministic fixtures generated from the schema, so
  fixture diffs in code review only change when the schema changes.
- As a schema author, I want generation to fail loudly when my schema is
  unsatisfiable, because that's a bug in the schema.

## Functional Requirements

### Command

- **F16-FR-01** A command `jsonschema.generateSampleData` MUST be available
  when `jsonschema.isJsonSchema` is `true`, and MUST also be reachable from
  the **Bind Schema…** success notification ("Generate sample file?").
- **F16-FR-02** An output-format picker MUST offer **JSON** and **YAML**
  (extending to TOML when F11 lands); the result opens in a new untitled
  editor of that language.

### Generation Rules

- **F16-FR-03** Value selection MUST honour, in priority order: `const`,
  `examples[0]`, `default`, first `enum` entry, then a type-derived value.
- **F16-FR-04** Type-derived values MUST satisfy the subschema's constraints:
  string `minLength`/`maxLength`/`pattern` (best-effort for simple patterns)
  and common `format`s (`date-time`, `date`, `email`, `uri`, `uuid`); numeric
  `minimum`/`maximum`/`multipleOf`; array `minItems` (generate exactly
  `max(minItems, 1)` items); object `required` properties always, optional
  properties only when `minProperties` demands more.
- **F16-FR-05** Composition keywords: `allOf` subschemas are merged
  best-effort; for `oneOf`/`anyOf` the first branch that yields a valid value
  is used.
- **F16-FR-06** `$ref`s MUST resolve with the same semantics as F13 (local,
  relative, cached remote; uncached remote refs offer *Cache Schema Locally*).
- **F16-FR-07** Recursive schemas MUST be depth-capped (default 5); beyond the
  cap, optional branches are dropped and required recursive branches use the
  minimal terminating value. Generation MUST always terminate.
- **F16-FR-08** The generated instance MUST be validated against the schema
  with Ajv (the F03 pipeline) before being shown. If validation fails —
  unsatisfiable or unsupported schema — the command MUST show an error listing
  the failing keywords/paths instead of opening an invalid document.
- **F16-FR-09** Generation MUST be deterministic for a given schema (fixed
  seed); a "Regenerate with random values" variant MAY be offered.
- **F16-FR-10** Generation MUST support producing **N instances** in one run.
  When N > 1 the output MUST be offered as a JSON array or as JSONL (one
  instance per line), and every emitted instance MUST individually pass the
  F16-FR-08 validation gate — an instance that fails is dropped and the shortfall
  reported, never emitted. Deterministic generation (F16-FR-09) means repeated
  instances would be identical, so bulk output MUST vary each instance where the
  schema allows it (enum rotation, index-derived strings, numbers within
  declared bounds) rather than repeating one document N times.

## Non-Functional Requirements

- **F16-NFR-01** Generation MUST run in-process, no subprocess and no network
  beyond cached-ref reads.
- **F16-NFR-02** The generator MUST be a pure module with unit tests per rule
  above, plus a `fast-check` property test: for arbitrary schemas from a
  supported-keyword generator, the output validates or generation errors
  cleanly (never an invalid document, ≥ 80 % coverage, Article V).

## Out of Scope

- Invalid/negative-case generation (fuzzing) — future spec.
- Guaranteed satisfaction of arbitrary `pattern`/`not`/complex `if-then-else`
  schemas — unsatisfied cases must fail loudly per F16-FR-08, never silently
  emit invalid data.
- Bulk generation (N documents / JSONL output).

## Acceptance Criteria

1. Generating from a schema with `required: ["name"]`, a `format: "email"`
   field, and a `default` produces an untitled document that **Validate This
   File** confirms valid, using the `default` where declared.
2. Running the command twice on the same schema yields byte-identical output.
3. A recursive `person → children: person[]` schema generates and terminates.
4. A schema with `{ "type": "string", "minLength": 5, "maxLength": 2 }` shows
   an error naming the conflicting constraints; no editor opens.
5. YAML output parses as YAML and validates against the schema.

## Open Questions

- Q1 — Library (`json-schema-faker`) vs in-house generator: JSF is featureful
  but heavy and randomness-oriented; determinism and Ajv-checked output may be
  simpler in-house. Decide at plan time (Article II amendment if a dependency
  is added).

## Relation to Existing Specs

- Mirrors **F06** (inference) UX: command → new untitled editor.
- Reuses **F03** validation as the output gate, **F13** ref resolution
  semantics, **F08** cached remote refs.
- **S03**: depth caps guarantee termination; **S05**: no network, no
  telemetry.

## History

- **2026-09-02** — Added F16-FR-10: bulk generation (N instances, as a JSON array or
  JSONL). Every instance passes the F16-FR-08 gate individually, and the
  generator varies enum/example/branch choices and steps scalars per instance so
  the output is N distinct documents rather than N copies of one — while staying
  deterministic for a given schema and count.
