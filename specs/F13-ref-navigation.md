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
  for `json`, `jsonc`, `yaml`, `yml`, and `toml` documents, active only where
  `jsonschema.isJsonSchema` semantics apply (the document is a schema file per
  F01-FR-02), plus inline-bound data files as specified in F13-FR-11.
- **F13-FR-02** Providers MUST trigger only when the cursor is on the string
  value of a `$ref` key (or the key itself), or an inline binding value per
  F13-FR-11.

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
  strings escaped, or placed in code spans, whose content renders literally and
  so MUST NOT be escaped; it MUST NOT execute or embed HTML.
- **F13-FR-10** Hover MUST NOT perform network I/O: remote refs show hover
  content only when the target is already cached; otherwise the hover states
  that the schema is not cached and names the command to cache it.

### Inline Data Bindings

- **F13-FR-11** Providers MUST also support the active inline `$schema`
  binding of JSON/JSONC, YAML/YML and TOML data files. Detection MUST reuse
  `extractInlineSchemaUrl` semantics (including YAML directive precedence
  and TOML root-table scope). Only the binding's value MUST trigger navigation
  or hover; nested keys, ordinary comments, unrelated strings and JSONL MUST NOT.
  Quoted YAML paths, paths containing spaces in a `$schema` key value and
  JSONC trailing commas MUST be supported. A YAML directive value MUST end at
  the first whitespace, as yaml-language-server reads it, so a trailing
  `# comment` is not part of the path. Assignment-like text inside TOML
  multiline values MUST NOT be treated as a binding.
- **F13-FR-12** Go to Definition on an inline binding MUST open its local
  schema or the actual cached file for a remote URL, resolving JSON Pointer
  fragments when present. Relative local paths MUST follow F10-FR-05's
  workspace-folder convention; outside a workspace they MUST resolve from
  the data file's directory. Uncached remote bindings MUST offer the existing
  cache command and MUST NOT fetch without the user choosing that action.
  Cache lookup MUST accept existing entries keyed by either the document URL
  or the full reference including its fragment.
- **F13-FR-13** Hover on an inline binding MUST show the target schema's
  title and description using escaped Markdown, or uncached guidance for
  an unavailable remote schema. It MUST NOT fetch, download, or prompt.
  Cached YAML MUST be parsed using the original URL's format (F13-FR-06).

## Non-Functional Requirements

- **F13-NFR-01** Definition/hover resolution MUST complete in-process with no
  subprocess; per-invocation work on a 500 KB schema SHOULD stay under 50 ms
  (parse results MAY be cached per document version).
- **F13-NFR-02** Pointer-resolution logic MUST be a pure module with unit
  tests covering escapes, missing paths, arrays, and YAML documents
  (≥ 80 % coverage, Article V).
- **F13-NFR-03** Inline binding extraction runs on hot paths (status bar on
  every editor switch, validation on save), so it MUST NOT parse a document
  whose text does not contain the literal `$schema`, and MUST reuse its result
  for an unchanged document version and language. A key spelled only through
  escapes (e.g. `"\u0024schema"`) is therefore not a binding.
  For YAML, when the first `# yaml-language-server: $schema=` directive is
  preceded only by ASCII-blank lines, comment lines, `%` directives before the
  first `---`, and bare `---` document-start markers, extraction MUST return it
  without parsing the document: no scalar can begin before the first content
  line. Any other YAML document containing `$schema` MAY be parsed. Either way
  the result MUST be identical to that of the parsing path.

## Out of Scope

- Find-all-references and rename/refactor of `$ref` targets. These live in
  [F30-schema-refactoring.md](F30-schema-refactoring.md), which reuses this
  spec's pointer parsing and AST locators.
- Resolving `$id`-based / `$anchor` URI bases (bundler-grade resolution lives
  in F14); this spec resolves location-based refs only.
- `$ref` completion (IntelliSense suggestions while typing a ref) — tracked in
  [#238](https://github.com/samdidos/vscode-json-schema-preview/issues/238).

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
6. Go to Definition on an inline-bound JSON/JSONC, YAML/YML or TOML data
   file's `$schema` value opens the local schema. A nested data file uses its
   workspace folder as the base for a relative binding.
7. A YAML `yaml-language-server: $schema=` directive supports the same
   navigation, taking precedence over a plain `$schema` key.
8. A remote inline binding opens the actual cached file, including schemas
   authored as YAML. An uncached binding offers the cache command only on
   Go to Definition.
9. Hover on an inline binding shows escaped title/description or uncached
   guidance without network I/O or a prompt. Other positions do not trigger.

## Open Questions

Q1 is resolved by F13-FR-11 through F13-FR-13 (issue #237).

## Relation to Existing Specs

- Reuses **F08** cache lookups and **F07** auth (via the existing
  cache-schema command) for remote targets.
- Consistent with **F01** type-labelling (`describeType`).
- **S03**: no subprocess, no network on hover; **S05**: no telemetry.

## History

- **2026-09-02** — Out of Scope narrowed: find-all-references and rename now exist,
  in [F30](F30-schema-refactoring.md), which reuses this spec's pointer parsing,
  `refKind` classification and AST locators rather than reimplementing them.
