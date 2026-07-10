# F18 — Code Generation (Schema → Types)

## Overview

Generate typed source code from a JSON Schema — the compile-time counterpart
of F16's runtime sample data. The first target language is **TypeScript**:
given a schema, produce `interface`/`type` declarations a developer can paste
into their project so data validated by the schema is also typed in code.
Generation is deterministic, in-process, and reuses the existing `$ref`
resolution and cache infrastructure.

Type emission is generated using **`quicktype-core`** (see Article II) rather
than a hand-rolled emitter. It is fed a schema that has already been made
fully self-contained by **F14's `bundleSchema`** (external documents embedded
under `$defs`, every `$ref` rewritten to a local pointer) — so all external
`$ref` resolution and any remote fetching happen through this repo's own
F13/F07/F08 machinery, never through quicktype's own resolver; the engine
only ever follows local pointers within the single document it is given.
(Bundling is used rather than full dereferencing deliberately: inlining every
ref would duplicate shared `$defs` entries into structurally identical but
separately named declarations, defeating F18-FR-06's named-declaration
requirement.) quicktype-core also supports several other
output languages internally; this spec still scopes the command to
TypeScript only (see Out of Scope) — the engine choice does not by itself
expand what's offered in the picker.

## User Stories

- As a TypeScript developer, I want types generated from the schema my config
  files are bound to, so my code that reads those files is type-safe without
  hand-maintaining a parallel interface.
- As a schema author, I want the generated types to carry the schema's
  `title`/`description` as doc-comments, so consumers see the documentation in
  their editor.
- As a maintainer, I want regeneration to be byte-stable for an unchanged
  schema, so generated files can be committed and reviewed like any other code.

## Functional Requirements

### Command

- **F18-FR-01** A command `jsonschema.generateTypes` MUST be available when
  `jsonschema.isJsonSchema` is `true` for the active editor, and MUST also be
  offered from the **Bind Schema…** success notification alongside F16's
  "Generate sample file?".
- **F18-FR-02** The result MUST open in a new untitled editor with the target
  language set (TypeScript initially; the picker design MUST allow adding
  further languages without a breaking UX change).

### Mapping Rules (TypeScript)

- **F18-FR-03** Object schemas MUST map to `interface`/`type` declarations:
  `required` properties as mandatory members, others optional (`?`);
  `additionalProperties: <schema>` as an index signature;
  `additionalProperties: false` omits the index signature.
- **F18-FR-04** Primitive and structural keywords MUST map as: `enum` → union
  of literal types (non-string members MAY widen to their primitive type,
  noted per F18-FR-08), `const` → a literal type (non-string `const`s MAY
  widen likewise), `array` → `T[]` (fixed `prefixItems`/tuple-form `items`
  arrays MAY be emitted as an array of the union of the element types, with a
  comment noting the tuple shape per F18-FR-08), `oneOf`/`anyOf` → union,
  `allOf` → intersection (or a single merged declaration carrying the
  combined members, which is the same type), nullable (`type: [T, "null"]`)
  → `T | null`.
- **F18-FR-05** `description` MUST be emitted as a TSDoc comment on the
  generated declaration/member; `title` is consumed by declaration naming
  (F18-FR-07) rather than duplicated into the TSDoc.
- **F18-FR-06** `$ref`s MUST resolve with F13 semantics (local pointer,
  relative file, cached remote; uncached remote refs offer *Cache Schema
  Locally*). Concretely, the schema MUST be made fully self-contained with
  F14's `bundleSchema` **before** it reaches the code-generation engine —
  every external document embedded under `$defs`, every `$ref` rewritten to
  a local pointer — so the engine MUST NOT fetch anything or resolve any
  reference outside the single document it is given (local-pointer lookups
  within that document are permitted). Each `$defs`/`definitions` entry and
  each referenced external schema MUST become a **named** declaration
  referenced by name — recursion is expressed through type references and
  MUST always terminate.
- **F18-FR-07** Declaration names MUST be derived deterministically (`title`,
  else `$defs` key, else file stem), sanitised to valid identifiers, with
  collisions disambiguated by suffixes assigned in a stable order.
- **F18-FR-08** Keywords with no type-level counterpart (e.g. `pattern`,
  `minimum`, `if`/`then`/`else`) MUST degrade gracefully: emit the widest
  correct type plus a comment naming the unrepresented constraint. The output
  MUST always be syntactically valid TypeScript.
- **F18-FR-09** Output MUST be deterministic: the same schema (and resolved
  refs) yields byte-identical output across runs and machines.

## Non-Functional Requirements

- **F18-NFR-01** Generation MUST run in-process — no subprocess, no network
  beyond cached-ref reads (S05). This applies to the whole
  `jsonschema.generateTypes` pipeline, not just the emitter: any network
  access happens only during the F14 bundling step (which already goes
  through F07 auth and prefers F08's cache), never inside the
  code-generation engine itself, which receives an already self-contained
  schema and MUST be able to run fully offline.
- **F18-NFR-02** The generator MUST be pure with respect to I/O — schema in,
  generated text out, with no subprocess and no network call of its own (an
  async function returning a string/Promise\<string\> satisfies this; it
  need not be synchronous) — with unit tests per mapping rule above and
  ≥ 80 % coverage on all axes (Article V); generated output snapshots MUST
  be validated by compiling them with the in-repo TypeScript compiler in
  tests.
- **F18-NFR-03** The `quicktype-core` dependency MUST be pinned to an exact
  version in `package.json` (no `^`/`~` range). Determinism (F18-FR-09)
  depends on this library's output not changing silently between installs;
  version bumps MUST be a deliberate change that re-verifies byte-identical
  output against the existing snapshot tests.

## Out of Scope

- Languages other than TypeScript (Go/Python/Java) — the picker is designed
  for them, but each is a future spec amendment. `quicktype-core` (the
  chosen engine) already supports several of these output languages
  internally; that does not itself change scope — each additional language
  still needs its own spec amendment before being offered in the picker.
- Writing directly into the user's project (the untitled editor keeps the
  user in control of destination and formatting).
- Runtime validator code generation (Ajv standalone) — future work.

## Acceptance Criteria

1. A schema with `required`, an `enum`, a `$defs` entry referenced twice, and
   `description`s generates TypeScript that compiles under `tsc --strict`,
   with one named declaration per `$defs` entry and TSDoc comments present.
2. A recursive `person → children: person[]` schema generates a self-
   referencing named type and terminates.
3. Running the command twice yields byte-identical output.
4. A schema using `if`/`then` still generates valid TypeScript with a comment
   noting the unrepresented conditional.

## Open Questions

- ~~Q1 — Library (`json-schema-to-typescript`) vs in-house emitter~~
  **Resolved:** neither. `json-schema-to-typescript` was ruled out (heavy
  `prettier` dependency chain, its own `$ref` resolver conflicts with
  F18-FR-06, not tuned for determinism); a pure in-house emitter was the
  original lean, following the F16 precedent. After evaluating output
  quality and multi-language reach, the decision is **`quicktype-core`**
  instead — accurate, actively used, and its other language backends mean
  future languages (Out of Scope, above) are a picker/spec change rather
  than a new codegen engine. Its `$ref` resolution and network access are
  avoided entirely by pre-resolving with F14 (see F18-FR-06, F18-NFR-01;
  originally worded as pre-*dereferencing*, later refined to pre-*bundling*
  because full inlining duplicates shared `$defs` entries into separately
  named copies). Added to Article II with its rationale; see F18-NFR-03 for
  the version-pinning requirement this choice implies.

## Relation to Existing Specs

- Mirrors **F16** (sample data) UX: command → new untitled editor; shares the
  "Bind Schema… success" entry point.
- Reuses **F13** ref resolution semantics and **F08** cached remote refs.
- **F14**: `bundleSchema` is reused directly as the pre-generation
  resolution step — the code-generation engine (`quicktype-core`) never
  performs its own external `$ref` resolution or fetching.
- **S05**: no network beyond cache, no telemetry. **S02**: read-only with
  respect to the workspace; safe in untrusted workspaces.
