# F14 — Schema Bundling & Dereferencing

## Overview

A command that flattens a multi-file schema into one self-contained document.
Two modes: **bundle** (external refs are pulled into `$defs` and refs are
rewritten to point at them — round-trippable and draft-idiomatic) and
**dereference** (refs are replaced inline by their targets — maximally
portable, with cycle protection). Remote refs resolve through the existing
auth (F07) and cache (F08) machinery, so a private schema tree can be bundled
into a single committable file.

## User Stories

- As a schema author, I want to distribute my schema as a single file even
  though I author it across many files, so consumers don't need my directory
  layout.
- As a platform engineer, I want to bundle a schema whose refs point at our
  private registry into one local file, so tools without our credentials can
  still use it.

## Functional Requirements

### Command

- **F14-FR-01** A command `jsonschema.bundleSchema` MUST be available (palette
  and editor title) when `jsonschema.isJsonSchema` is `true`.
- **F14-FR-02** The command MUST offer a mode picker: **Bundle (refs →
  `$defs`)** and **Dereference (inline)**, each with a one-line explanation.
- **F14-FR-03** The result MUST open in a new untitled editor of the same
  language (JSON in → JSON out, YAML in → YAML out); the source file MUST NOT
  be modified.

### Resolution

- **F14-FR-04** External refs (relative paths and `http(s)` URLs) MUST be
  resolved recursively; remote fetches use stored credentials (F07), the
  `jsonschema.remoteFetchTimeout` setting, and prefer an existing local cache
  entry (F08) over the network.
- **F14-FR-05** In bundle mode each distinct external document (or subschema)
  MUST be inserted exactly once under `$defs`, with a deterministic,
  collision-free key derived from its source (existing `$id`, else filename
  stem, else pointer); every referring `$ref` is rewritten to the new local
  pointer.
- **F14-FR-06** In dereference mode, cyclic references MUST be detected and
  left as internal `$ref`s into `$defs` (never infinite expansion); the
  command MUST NOT hang or overflow on cyclic schemas.
- **F14-FR-07** The root schema's `$schema` and `$id` keywords MUST be
  preserved verbatim; nested `$id`s that would change resolution semantics
  after inlining MUST be removed from inlined copies, and this MUST be noted
  in the completion message.
- **F14-FR-08** An unresolvable ref MUST abort the operation with an error
  naming the ref and its source location; a 401/403 MUST surface the standard
  *Configure Auth* offer (F07).

### Feedback

- **F14-FR-09** Resolution MUST run under a progress notification showing the
  document currently being fetched, and MUST be cancellable.

## Non-Functional Requirements

- **F14-NFR-01** Bundling MUST run in-process (no subprocess). Total external
  documents are capped (default 100) to bound memory; exceeding the cap aborts
  with a clear error.
- **F14-NFR-02** The resolver/rewriter MUST be a pure module with unit tests
  covering cycles, duplicate targets, `$id` handling, and YAML round-trips
  (≥ 80 % coverage, Article V).

## Out of Scope

- Draft migration (e.g. draft-07 → 2020-12) — the output keeps the input's
  draft.
- Bundling *data* files or non-schema documents.
- Watching and re-bundling on change.

## Acceptance Criteria

1. Bundling a schema with two relative-file refs produces one untitled JSON
   document with both targets under `$defs` and rewritten refs; the output
   validates the same instances as the original (spot-checked via F03).
2. Dereferencing a schema containing a self-referential `person → person` loop
   terminates and keeps the loop as a `$defs` ref.
3. Bundling a schema with a private remote ref succeeds using stored
   credentials and prefers the local cache when present.
4. An unresolvable ref aborts with an error naming the offending `$ref`.
5. The source file's mtime and content are unchanged after either mode.

## Open Questions

- Q1 — Library vs in-house: `@apidevtools/json-schema-ref-parser` is the
  de-facto standard but brings its own resolver stack; an in-house resolver
  can reuse F07/F08 directly. Decide at plan time (constitution Article II
  amendment needed if a dependency is added).

## Relation to Existing Specs

- Reuses **F07** (auth) and **F08** (cache) for remote refs.
- Complements **F13** — same pointer-resolution semantics (RFC 6901).
- **S02**: bundling reads workspace files and the network; it MUST be blocked
  in untrusted workspaces like other remote-fetch operations.
- **S03**: cancellable progress; bounded fetch count and timeouts.
