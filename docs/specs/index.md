<!-- spec:S10 start -->
# How it works

This project is **spec-driven**: every feature is specified *before* it is
implemented (the project constitution makes this a MUST), and every code
change must trace back to a requirement. The specs live in
[`specs/`](https://github.com/samdidos/vscode-json-schema-preview/tree/main/specs)
in the repository; this section of the site renders them read-only — the
repository remains the only write path.

- Browse the [requirement matrix](./matrix) to see every spec and its
  implementation status.
- Click any spec in the matrix (or the sidebar) to read its full text.

## Spec files and requirement IDs

Each file in `specs/` covers one **feature** (`F01`–`F22`, e.g. the preview
panel or schema diff) or one **system quality** (`S01`–`S10`, e.g. security or
performance) using [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) key
words: **MUST**, **SHOULD**, **MAY**, and friends have their standardized
meanings.

Every requirement has a stable ID defined in **bold** at its definition site —
`F10-FR-04` is functional requirement 04 of feature spec F10, `S01-SR-02` is
system requirement 02 of system spec S01, and `-NFR-` marks non-functional
requirements. These IDs are the anchor for everything else: the matrix, test
tags, documentation tags, and pull-request descriptions all refer to them.

## The traceability matrix

`specs/traceability.json` maps every requirement ID to a `status` and the
source files implementing it (`impl`). It is the single machine-readable
record of what is built, planned, or deferred:

<SpecStatusTable />

<!-- spec:S11 -->
The matrix has its own JSON Schema at `specs/traceability.schema.json`: the
file binds to it inline via `$schema` (the same convention the extension uses
for data files), a test validates it against that schema, and the TypeScript
types this docs site uses to read the matrix are **generated from the schema
by the extension's own code-generation feature** — run
`npm run codegen:traceability` to regenerate them. In other words, the project
validates and types its own source of truth with the tools it ships.

## Test tags

Unit and E2E tests declare which requirement they cover by putting its ID in
square brackets in the test (or suite) title:

```ts
test('[F10-FR-04] inserts $schema as the first key in the root object', () => { … });
```

Test coverage is **auto-discovered** from these tags — the matrix never lists
test names, so there is nothing to keep in sync by hand.

<!-- spec:S07 -->
## Documentation tags

Documentation follows the same discipline: user-facing doc sections (in
`README.md` and this site) name the spec(s) they document with an invisible
HTML-comment tag, either inline — `<!-- spec:F13 -->` next to the element — or
as a matched `<!-- spec:F14 start -->` … `<!-- spec:F14 end -->` pair wrapping
a section. `npm run check:doc-traceability` fails on a stale id, an unbalanced
pair, or a tag documenting an unimplemented spec, and warns when an
implemented feature has no documentation anywhere.

## Enforcement

`npm run check:traceability` cross-checks the three sources and fails on real
drift: a requirement with no matrix entry, a matrix entry whose requirement no
longer exists, a test tag matching no requirement, or an `impl` path that does
not exist on disk. Both checkers run inside `npm run verify` — the git
pre-commit hook and CI — so drift blocks the commit no matter which human or
agent makes the change.

## Workflow when implementing a requirement

1. Find (or first write) the requirement covering the change; new requirements
   are scaffolded into the matrix with `npm run trace:init`.
2. Implement, then set the requirement's `status` and `impl` paths in
   `specs/traceability.json`.
3. Tag the covering test(s) with the requirement ID.
4. `npm run check:traceability` must stay green, and the pull request cites
   the requirement ID(s). A change with no requirement ID should be docs-only,
   a dependency bump, or CI/tooling — and say so.
<!-- spec:S10 end -->
