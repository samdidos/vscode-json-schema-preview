# S11 — Traceability Matrix Schema & Generated Types

## Overview

`specs/traceability.json` is the project's machine-readable source of truth for
requirement status, read by the checkers (`check:traceability`,
`maturity-score`) and by the docs site's Specs section (S10). Its shape was
described only by a prose `$comment` and duplicated by hand wherever code
touched it (e.g. the docs data loader's inline `{ statuses; requirements }`
cast). This spec gives the matrix a real **JSON Schema** and generates its
**TypeScript types from that schema using the project's own F18 code
generator** — the extension's schema-to-types feature applied to the
repository's own data. Eating our own dog food keeps one authoritative shape:
the schema validates the matrix, and the same schema produces the types the
code consumes, so neither can silently drift from it.

## User Stories

- As a maintainer editing `traceability.json`, I want editor validation and a
  CI check that catches a malformed entry (bad status, wrong type) instead of a
  confusing failure deep in a script.
- As a contributor, I want the TypeScript that reads the matrix to use types
  derived from the schema, not a hand-copied shape that can rot.
- As the project, I want a standing demonstration that F18 (schema → types)
  works on a real schema, exercised on every test run.

## Functional Requirements

### Schema

- **S11-SR-01** A JSON Schema for the matrix MUST exist at
  `specs/traceability.schema.json`. It MUST be self-contained (no external
  `$ref`), so it needs no F14 bundling before F18 consumes it, and it MUST
  declare a JSON Schema draft via `$schema`.
- **S11-SR-06** The schema MUST carry an absolute `$id` whose path embeds a
  **major-version segment** (`.../v1/...`), following JSON Schema's convention
  that a schema's *identity* — not its file location — carries its version: a
  backward-incompatible change to the matrix shape is published under a new
  `$id` (`.../v2/...`) so existing consumers keep resolving the identity they
  validated against, while the working file stays at
  `specs/traceability.schema.json`.
- **S11-SR-02** `specs/traceability.json` MUST validate against
  `specs/traceability.schema.json`, and MUST reference it with an inline
  `$schema` key (the F10 inline-binding convention) so the extension and other
  editors bind the two automatically.

### Generated Types

- **S11-SR-03** The matrix's TypeScript types MUST be generated from
  `specs/traceability.schema.json` by the project's own F18 generator
  (`generateTypeScript`, quicktype-core underneath) — not a separately invoked
  tool — and committed at `docs/.vitepress/traceability.types.ts` with a
  header marking the file generated. Regeneration MUST be a single command
  (`npm run codegen:traceability`).
- **S11-SR-04** The committed generated file MUST stay in sync with the schema:
  regenerating from the current schema MUST reproduce the committed body. Drift
  MUST be detectable mechanically (a test failing when the two diverge).
- **S11-SR-05** TypeScript that reads the matrix (the docs data loader) MUST
  consume the generated types rather than re-declaring the matrix shape inline.

## Non-Functional Requirements

- **S11-NFR-01** Generation MUST reuse the exact F18 module the extension ships
  (`src/typeGenerator.ts`), so the repository's types and the user-facing
  feature cannot diverge in behaviour; the codegen script MUST NOT reimplement
  the quicktype invocation.
- **S11-NFR-02** The generated output MUST be deterministic (F18-NFR-03):
  running the command twice with an unchanged schema produces an identical
  file, so the drift check is stable.

## Out of Scope

- Generating types in languages other than TypeScript — only the docs loader
  (TypeScript) consumes the matrix; the F18 feature already covers other
  targets for end users.
- Schematising other repository JSON (e.g. `maturity-score.json`) — this spec
  covers the traceability matrix only.
- Replacing the runtime validation the checkers already perform; the schema
  augments them, it does not rewrite `check:traceability`.

## Acceptance Criteria

1. `specs/traceability.schema.json` exists, is draft 2020-12, has no external
   `$ref`, and `specs/traceability.json` carries a `$schema` pointing at it.
2. Validating `specs/traceability.json` against the schema with the project's
   `createAjv` passes.
3. `npm run codegen:traceability` writes `docs/.vitepress/traceability.types.ts`
   containing `TraceabilityMatrix`, `Requirement`, and a `Status` union, and
   running it a second time leaves the file unchanged.
4. The docs loader imports `TraceabilityMatrix` from the generated file instead
   of casting to an inline object type.
5. A unit test fails if `traceability.json` violates the schema or if the
   committed generated file no longer matches a fresh generation.
