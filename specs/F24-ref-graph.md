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
- **F24-FR-13** Every node representing an actual subschema (the root and each
  `$defs`/`definitions` entry) MUST carry that subschema's `type` (a string, or
  its `type` array joined with `' | '`) and `description` when the subschema
  declares them, so the diagram and adjacency list can show more than the bare
  name. A node reached only through an unfetched external `$ref` carries none
  of this (F24-NFR-03: never fetched automatically) until expansion resolves
  it (F24-FR-08–12), at which point the fetched document's own root and
  `$defs`/`definitions` entries get the same treatment.
- **F24-FR-14** When a `$defs`/`definitions` entry's subschema carries a
  `$comment` recording a bundled origin (F14-FR-10's `Bundled from <id>`
  convention), the graph builder MUST recover that origin and expose it on the
  node; both the SVG rendering and the adjacency list MUST display it. This
  lets a schema that has already been bundled (F14) still show, per folded-in
  definition, the external source it came from — information bundling would
  otherwise erase.

### External Resolution (opt-in)

By default the graph never touches the network (F24-NFR-03). A user MAY opt
into resolving external `$ref`s so the diagram shows their internal structure
too, without giving up the no-surprise-network-access guarantee the base
command has always made.

- **F24-FR-08** When the locally-built graph contains at least one external
  (`relative`/`remote`) node, the command MUST ask the user — before opening
  the panel — whether to resolve those references over the network, stating
  how many there are. Declining, dismissing the prompt, or an untrusted
  workspace (S02) MUST open the panel with the unchanged local-only graph
  (F24-FR-04–07); this MUST NOT be offered at all in an untrusted workspace,
  matching F14's refusal.
- **F24-FR-09** On acceptance, resolution MUST run under a cancellable progress
  notification (S03) naming the document currently being fetched, reuse stored
  credentials (F07) and prefer the local cache (F08) over the network, and
  honour the `jsonschema.remoteFetchTimeout` setting — the same resolver
  contract F14 bundling uses (`DocResolver`).
- **F24-FR-10** Resolution MUST recurse into each fetched external document's
  own `$defs`/`definitions` and further `$ref`s, up to
  `jsonschema.refGraph.maxDepth` hops from the root (default **3**,
  user-configurable). Beyond that depth, further external targets MUST be
  rendered as unfetched terminal nodes exactly as the local-only graph already
  does (labelled by their raw ref, no network call) — never dropped.
- **F24-FR-11** A document already fetched in the current resolution pass
  (identified by the resolver's canonical id) MUST be reused rather than
  re-fetched or re-walked when reached again via another `$ref`; a reference
  cycle spanning multiple fetched documents MUST be detected the same way as a
  same-document cycle (extends F24-FR-06 — `detectCycle` operates on the
  expanded graph's edges without needing to know they cross a document
  boundary).
- **F24-FR-12** A single external document that fails to resolve (network
  error, parse failure, HTTP error) MUST NOT abort the whole operation: it is
  rendered as a distinct **error** node carrying the failure reason, listed
  alongside unresolved references, while the rest of the graph still renders.
  A 401/403 MUST surface the standard *Configure Auth* offer (F07), deduped to
  once per host rather than once per failing ref.

## Non-Functional Requirements

- **F24-NFR-01** Graph construction, cycle detection, layout, and SVG/adjacency
  rendering MUST be pure, `vscode`-free modules with ≥ 80 % unit-test coverage
  (Article V). Only the webview panel shell (`RefGraphPanel`) is VS Code-bound;
  like the other custom webview panels it is excluded from coverage and mutation
  and its requirements are tracked `manual`.
- **F24-NFR-02** All node labels, ref strings, and any rendered `type`,
  `description`, or recovered bundled-origin text (F24-FR-13/14) MUST be
  escaped (S01) — all of it is untrusted schema content.
- **F24-NFR-03** The core builder (`buildRefGraph`) MUST NOT fetch anything
  itself: external nodes are shown as endpoints by their URI; their contents
  are not resolved. It MUST NOT throw on malformed schemas. Fetching only ever
  happens in the separate, opt-in expansion step (F24-FR-08–12), never as a
  side effect of building or rendering the base graph.
- **F24-NFR-04** The expansion step MUST cap the number of documents fetched in
  one resolution pass (default 100, the same cap F14 uses) to bound memory and
  outbound requests; once the cap is reached, remaining queued targets are left
  as unfetched terminal nodes rather than erroring the whole graph.
- **F24-NFR-05** The expansion step MUST be a pure function that takes a
  caller-supplied async resolver (F14's `DocResolver` type) — no direct
  `vscode` or network import in `refGraph.ts` — and MUST be unit-tested with a
  mock resolver covering: a successful fetch, a cache-preferred fetch, a depth
  cutoff, document reuse/cycle across documents, a fetch failure, and the
  document cap.

## Out of Scope

- Automatic/always-on resolution — following external refs is opt-in per
  F24-FR-08 and always asks first; it is never silently automatic on open.
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
6. A schema with one remote `$ref`: declining the resolution prompt opens the
   local graph unchanged and makes no network call.
7. Accepting the prompt for a schema whose remote document itself contains a
   further external `$ref`, with `maxDepth` set to 2, fetches both documents and
   shows the second document's own `$defs`; a third-level ref is shown as an
   unfetched terminal node.
8. A resolution failure on one external document (network error) renders an
   error node with the failure reason; the rest of the graph — including other
   branches unaffected by that failure — still renders.
9. A `$defs` entry with `type: "object"` and a `description` renders both,
   truncated, under its name; a node with neither shows only the name, as
   before.
10. Graphing a schema previously produced by `bundle` (F14), whose `$defs`
    entries carry a `Bundled from <id>` `$comment`, shows that origin on the
    corresponding node instead of just the folded-in definition's key name.

## Relation to Existing Specs

- Reuses **F13**'s ref classification (`refKind`, `parseRef`) and pointer
  resolution; complements **F14** (bundle) — the opt-in expansion step reuses
  F14's `DocResolver` contract (and, transitively, F07 auth and F08 cache)
  rather than a second resolution stack. F24-FR-14 also reads F14-FR-10's
  `$comment` convention, so a schema round-tripped through bundling still
  shows its external provenance in the graph.
- **S01/S06** govern the webview surface; **S02**: the opt-in expansion reads
  the network and MUST be refused in untrusted workspaces, same as F14; **S05**:
  by default nothing is fetched or sent anywhere — the local-only graph is
  computed entirely from the open document, and expansion only ever runs after
  an explicit per-invocation opt-in.
