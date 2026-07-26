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

### Requirement Lifecycle Stamps

- **S11-SR-07** A requirement entry MAY carry two optional ISO `YYYY-MM-DD`
  date stamps recording its lifecycle: `specifiedAt`, the day the requirement
  entered the matrix, and `implementedAt`, the day its status first became
  `implemented` or `manual`. Both MUST be declared in the schema and preserved
  by any rewrite of the matrix (`--init` rewrites every entry, so a naive
  rewrite that reconstructs entries from `status`/`impl`/`note` alone would
  silently erase them).
- **S11-SR-08** The stamps MUST be maintained by `scripts/check-traceability.mjs`
  rather than by hand: `--init` MUST stamp `specifiedAt` on each entry it
  scaffolds, and MUST stamp `implementedAt` on any lifecycle-tracked entry
  (one that already carries `specifiedAt`) whose status has reached
  `implemented`/`manual` without one. Validation MUST remain read-only and
  MUST NOT write stamps; where a lifecycle-tracked entry is missing a stamp it
  owes, validation MUST **warn**, never fail — an absent date is a prompt to
  run `--init`, not a broken build.
- **S11-SR-09** Requirements that predate lifecycle stamping MUST be left
  unstamped rather than backfilled. The matrix's own history cannot supply an
  honest `specifiedAt`: 502 of the entries were introduced by a single
  backfill commit on 2026-07-20, long after the requirements they describe
  were written, so a git-derived date would record when the *matrix* learned
  of a requirement and present it as when the requirement was *specified*.
  Consumers MUST therefore treat an unstamped entry as "predates lifecycle
  tracking" — the same honesty the `untracked` status already encodes — and
  MUST NOT infer a date for it.

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
6. Running `--init` on a matrix containing a stamped entry leaves that entry's
   `specifiedAt` unchanged and preserves it through the rewrite; a newly
   scaffolded entry comes back carrying today's `specifiedAt`.
7. Flipping a lifecycle-tracked entry to `implemented` and re-running `--init`
   stamps `implementedAt`; running validation before that prints a warning and
   still exits 0.
8. Entries with no `specifiedAt` are reported as predating lifecycle tracking
   and are never assigned a date by any tool.

## History

- 2026-07-25 — Added S11-SR-07/08/09: optional `specifiedAt`/`implementedAt`
  stamps on requirement entries, maintained by `--init` and warned about (never
  enforced) by validation. Backfilling them was explicitly rejected — replaying
  the matrix's git history showed 502 of 557 entries appearing in one backfill
  commit, so a derived date would misreport when requirements were specified.
