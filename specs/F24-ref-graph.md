# F24 — `$ref` Dependency Graph View

## Overview

F13 navigates a single `$ref`; F14 bundles all of them into one document. This
spec gives the bird's-eye view in between: a graph of a schema's `$ref`
dependencies — which definitions reference which, and which external files or
URLs the schema pulls in — rendered as a small, self-contained webview. It makes
the *shape* of a schema legible at a glance: unused `$defs`, deeply chained
references, reference cycles, and every external dependency the schema carries.

## User Stories

- As a schema author, I want to see which `$defs` reference which, so I can spot
  a definition nothing uses or a chain that's deeper than I expected.
- As a reviewer, I want every external file/URL a schema depends on listed in one
  place, so I know its blast radius before bundling (F14).
- As a maintainer, I want reference cycles surfaced, so I understand a schema
  that can't be flattened trivially.

## Functional Requirements

### Command & Surface

- **F24-FR-01** A command `jsonschema.refGraph` MUST be available when
  `jsonschema.isJsonSchema` is `true`, operating on the active schema document.
- **F24-FR-02** The graph MUST be presented in a webview panel that follows all
  S01 rules (locked-down Content-Security-Policy; the panel renders static
  HTML/SVG with inline styles and **no scripts**, so no remote resource of any
  kind can load) and S06 semantics (headings, a text adjacency list beside the
  diagram, severity/kind conveyed by label and shape, never colour alone).
- **F24-FR-03** When the schema declares no `$ref` the command MUST say so and
  MUST NOT open an empty panel.

### Graph Construction

- **F24-FR-04** The builder MUST walk the parsed schema and produce a directed
  graph whose nodes are: the root (`#`), each `$defs`/`definitions` entry
  (whether or not it is referenced), and each distinct external target (a
  relative-path or remote-URL `$ref`, keyed by its URI without fragment). Edges
  MUST run from the nearest enclosing named node (root or a definition) to the
  `$ref` target, labelled with the raw ref string.
- **F24-FR-05** Same-document `$ref`s MUST be classified against the schema: a
  pointer that resolves is a **definition** edge; one that does not is reported
  as an **unresolved** reference (a distinct node kind), never dropped.
- **F24-FR-06** The builder MUST detect at least one reference **cycle** among
  same-document nodes when present (a schema whose flattening is non-trivial),
  and expose it so the view can flag it.
- **F24-FR-07** The layout MUST assign nodes to layers by breadth-first distance
  from the root (nodes unreachable from the root placed in a trailing layer), so
  the rendered diagram reads left-to-right by dependency depth.

## Non-Functional Requirements

- **F24-NFR-01** Graph construction, cycle detection, layout, and SVG/adjacency
  rendering MUST be pure, `vscode`-free modules with ≥ 80 % unit-test coverage
  (Article V). Only the webview panel shell (`RefGraphPanel`) is VS Code-bound;
  like the other custom webview panels it is excluded from coverage and mutation
  and its requirements are tracked `manual`.
- **F24-NFR-02** All node labels and ref strings rendered into HTML/SVG MUST be
  escaped (S01) — a `$ref` value is untrusted schema content.
- **F24-NFR-03** The builder MUST NOT fetch anything: external nodes are shown
  as endpoints by their URI; their contents are not resolved (bundle via F14
  first for a deep graph). It MUST NOT throw on malformed schemas.

## Out of Scope

- Following external `$ref`s into their target documents (no network; F14 is the
  bundle-then-inspect path).
- Interactive graph manipulation (drag, collapse) — the panel is a static,
  script-free rendering for v1.
- Click-to-navigate from a graph node to its source line (F13 already provides
  go-to-definition in the editor).

## Acceptance Criteria

1. A schema with `$defs` `A`→`B` and an unreferenced `C` renders three definition
   nodes plus the root, an edge A→B, and shows `C` as an isolated node.
2. A `$ref` to `#/$defs/Missing` renders a node marked *unresolved* and is listed
   as an unresolved reference, not silently omitted.
3. A schema with `A`→`B`→`A` reports a cycle that the view flags.
4. A `$ref` to `./other.json#/X` and one to `https://example.com/s.json` render
   two external nodes labelled by their URI; nothing is fetched.
5. A schema with no `$ref` shows a "no references" notice and opens no panel.

## Relation to Existing Specs

- Reuses **F13**'s ref classification (`refKind`, `parseRef`) and pointer
  resolution; complements **F14** (bundle) — this shows the dependency structure
  bundling would flatten.
- **S01/S06** govern the webview surface; **S05**: nothing is fetched or sent
  anywhere, the graph is computed entirely from the open document.
