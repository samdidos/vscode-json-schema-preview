# F13 — `$ref` Navigation & Hover

## Overview

Make the text editor itself schema-aware: **Go to Definition** on a `$ref`
value jumps to the referenced subschema (same document, another workspace
file, or a cached remote schema), and hovering a `$ref` shows a summary of the
referenced subschema. Today the preview panel is the only way to understand a
multi-file schema; this feature removes the biggest day-to-day friction for
schema *authors*.

## User Stories

- As a schema author, I want to Ctrl+Click `"$ref": "#/$defs/address"` and land
  on the `address` definition, so I can navigate large schemas like code.
- As a schema author splitting schemas across files, I want relative refs
  (`"./common.schema.json#/$defs/id"`) to open the target file at the right
  location.
- As a consumer of a private remote schema, I want hover to show me the
  referenced subschema's title/type/description without opening the preview.

## Functional Requirements

### Scope of Providers

- **F13-FR-01** A `DefinitionProvider` and a `HoverProvider` MUST be registered
  for `json`, `jsonc`, `yaml`, and `yml` documents, active only where
  `jsonschema.isJsonSchema` semantics apply (the document is a schema file per
  F01-FR-02).
- **F13-FR-02** Providers MUST trigger only when the cursor is on the string
  value of a `$ref` key (or the key itself).

### Reference Resolution

- **F13-FR-03** JSON Pointer fragments MUST be resolved per RFC 6901,
  including the `~0` / `~1` escape sequences, against the parsed document
  (`jsonc-parser` for JSON/JSONC; the `yaml` AST for YAML so source ranges are
  available).
- **F13-FR-04** Same-document refs (`#/…`) MUST resolve to the target's exact
  range in the current editor.
- **F13-FR-05** Relative-path refs MUST resolve against the schema file's
  directory; the target file is opened and, when a fragment is present, the
  cursor placed on the pointer target.
- **F13-FR-06** Remote (`http(s)://`) refs MUST resolve to the local cached
  copy when one exists (F08). When none exists, Go to Definition MUST offer a
  one-click "Cache schema locally" action (reusing F08/F07) instead of failing
  silently. The cached copy MUST be parsed as YAML when the schema's
  **original URL** ends `.yaml`/`.yml`, and as JSON/JSONC otherwise — F08's
  on-disk cache file is always named with a `.json` extension regardless of
  the schema's authored format, so language detection MUST use the original
  URL, never the cached file's own extension.
- **F13-FR-07** An unresolvable pointer (no such path in the target document)
  MUST produce a non-modal message naming the missing pointer, not an error.

### Hover Content

- **F13-FR-08** Hover MUST show the referenced subschema's `title`, effective
  type (same labelling rules as the fallback renderer's `describeType`),
  `description`, and — for objects — up to the first 10 property names.
- **F13-FR-09** Hover content MUST be plain Markdown with all schema-derived
  strings escaped; it MUST NOT execute or embed HTML.
- **F13-FR-10** Hover MUST NOT perform network I/O: remote refs show hover
  content only when the target is already cached; otherwise the hover states
  that the schema is not cached and names the command to cache it.

## Non-Functional Requirements

- **F13-NFR-01** Definition/hover resolution MUST complete in-process with no
  subprocess; per-invocation work on a 500 KB schema SHOULD stay under 50 ms
  (parse results MAY be cached per document version).
- **F13-NFR-02** Pointer-resolution logic MUST be a pure module with unit
  tests covering escapes, missing paths, arrays, and YAML documents
  (≥ 80 % coverage, Article V).

## Out of Scope

- Find-all-references and rename/refactor of `$ref` targets.
- Resolving `$id`-based / `$anchor` URI bases (bundler-grade resolution lives
  in F14); this spec resolves location-based refs only.
- `$ref` completion (IntelliSense suggestions while typing a ref).

## Acceptance Criteria

1. Ctrl+Click on `"$ref": "#/$defs/address"` moves the cursor to the
   `address` definition in the same file.
2. Ctrl+Click on `"$ref": "./common.schema.json#/$defs/id"` opens
   `common.schema.json` at the `id` definition.
3. Hovering a same-file ref shows title, type, and description of the target.
4. Hovering an uncached remote ref shows "not cached" guidance; after running
   **Cache Schema Locally**, hover shows the target summary.
5. A ref to a missing pointer shows a message naming the pointer and does not
   throw.

## Open Questions

- Q1 — Should the providers also activate on *data* files' `$schema` values
  (jump to the bound schema)? Cheap to add; leaning yes.

## Relation to Existing Specs

- Reuses **F08** cache lookups and **F07** auth (via the existing
  cache-schema command) for remote targets.
- Consistent with **F01** type-labelling (`describeType`).
- **S03**: no subprocess, no network on hover; **S05**: no telemetry.
