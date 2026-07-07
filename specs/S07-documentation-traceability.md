# S07 — Documentation Traceability

## Overview

Every feature specified in `specs/` should be discoverable in the
documentation, and every piece of documentation should be attributable to the
spec it describes. This is the documentation analogue of the requirement
traceability that already links specs ↔ matrix ↔ tests (`specs/README.md`): a
lightweight, tool-neutral tag lets a human or a script answer two questions at
a glance — *"is this spec documented anywhere?"* and *"which docs belong to
this spec (and do they still match it)?"*.

There is no universal standard for tracing prose documentation back to
requirements (unlike code, where `[ID]` test tags already exist here), so this
spec defines a minimal convention built on **HTML comments**, which survive
Markdown, VitePress, and rendered HTML without affecting the reader.

## User Stories

- As a maintainer, I want to know which specs have no user-facing documentation
  so I can fill the gap before release.
- As a contributor, I want to find every doc section that describes a feature so
  I can update them together when the spec changes.
- As an agent (or human) adding a feature, I want a checked rule that reminds me
  to document it and tag that documentation to the spec.

## Functional Requirements

### Tag Convention

- **S07-SR-01** Documentation MUST trace to specs using an HTML-comment tag of
  the form `<!-- spec:<IDs> -->`, where `<IDs>` is a comma-separated list of one
  or more spec identifiers. An identifier MAY be a **feature id** (`F12`,
  `S07`) or a **requirement id** (`F12-FR-01`, `S07-SR-03`). The comment form
  MUST be used so the tag is invisible in rendered output across Markdown,
  VitePress, and HTML.
- **S07-SR-02** Two placements MUST be supported:
  - **inline** — `<!-- spec:F13 -->` placed on or adjacent to the documented
    element (a heading, paragraph, list item, or table cell), meaning "this
    element documents these specs";
  - **section** — a matched pair `<!-- spec:F14 start -->` … `<!-- spec:F14
    end -->` wrapping a block, meaning "everything between documents these
    specs". Every `start` MUST have a matching `end` for the same id set within
    the same file.

  A tag's `<IDs>` list is not limited to one identifier: a single element or
  section commonly documents several specs at once (e.g. a "Supported data
  formats" paragraph that covers JSON, YAML, *and* TOML support is one
  documentation site, not three), and MUST be tagged with all of them rather
  than picked apart or duplicated per spec:

  ```md
  <!-- spec:F03,F11 -->
  Data files can be JSON, JSONC, JSONL, YAML, or TOML.
  ```

  ```md
  <!-- spec:F04,F10,F11 start -->
  ## Schema Binding
  ... describes binding for JSON/YAML (F04, F10) and TOML's inline-only form (F11) ...
  <!-- spec:F04,F10,F11 end -->
  ```

  A section tag's id list MUST match exactly between its `start` and `end`
  comments (same ids, order-insensitive) — this is how the checker pairs them
  (S07-SR-06).

### Scope

- **S07-SR-03** User-facing documentation — the project `README.md` and the
  documentation site under `docs/` — MUST tag the feature spec(s) each
  section documents. A newly added user-facing feature MUST add at least one
  documentation tag referencing its feature id.
- **S07-SR-04** Agent-facing and internal docs (`AGENTS.md` and the files it is
  the source of truth for) MAY carry tags where a section maps cleanly to a
  spec; they are not required to, because they document process rather than
  end-user features.

### Checker

- **S07-SR-05** A script `npm run check:doc-traceability` MUST cross-reference
  the spec identifiers (feature ids derived from `specs/F*.md` / `specs/S*.md`
  filenames, and requirement ids defined in the spec bodies) against the
  `spec:` tags found in the documentation set.
- **S07-SR-06** The checker MUST **fail** (exit non-zero) when a tag references
  an identifier that does not exist (a stale or mistyped tag), or when a
  `start` tag has no matching `end` (or vice-versa) within a file — the
  documentation analogue of the stale-`[ID]`-test-tag failure in
  `check:traceability`.
- **S07-SR-07** The checker MUST **report** per-feature documentation coverage
  and **warn** (without failing) for any feature spec (`specs/F*.md`) that has
  no documentation tag anywhere, so undocumented features are visible without
  blocking unrelated work.
- **S07-SR-08** `check:doc-traceability` MUST run inside `npm run verify` so it
  fires from the git pre-commit hook and CI, keeping the guarantee below any
  single agent or tool (AGENTS.md principle 3, "Guarantees live *below* the
  agent").

## Non-Functional Requirements

- **S07-NFR-01** The convention MUST remain tool-neutral: plain HTML comments
  only, no dependency on a vendor-specific documentation-tracing tool, so any
  Markdown or HTML renderer and any agent can read and write the tags.
- **S07-NFR-02** The checker MUST have no third-party dependencies (plain Node,
  like the other `scripts/*.mjs` checkers) and MUST scan a bounded, explicit
  set of documentation paths (never `node_modules`).

## Out of Scope

- Verifying that documentation is *accurate* or *complete* against the spec
  text — the tag asserts association, not correctness. (A human or a future
  richer check owns semantic drift.)
- Requiring every requirement id to be individually documented — coverage is
  tracked at the feature-spec level; requirement-level tags are optional
  precision.
- Auto-generating documentation from specs.

## Acceptance Criteria

1. A `<!-- spec:F13 -->` tag in `README.md` makes `check:doc-traceability`
   count F13 as documented.
2. A tag referencing a non-existent id (e.g. `<!-- spec:F99 -->`) fails the
   checker with a message naming the id and file.
3. A `<!-- spec:F14 start -->` with no matching `end` in the same file fails the
   checker.
4. Removing all tags for a feature makes the checker warn that the feature is
   undocumented, but does not fail the build.
5. `npm run verify` invokes `check:doc-traceability` and passes when all tags
   are valid.
6. A `<!-- spec:F03,F11 -->` tag documenting supported data formats counts
   toward *both* F03 and F11's coverage, and a section tagged
   `<!-- spec:F04,F10,F11 start -->` … `<!-- spec:F04,F10,F11 end -->` is
   recognised as one matched, valid section for all three ids.

## Relation to Existing Specs

- Complements the **requirement traceability** system (`specs/README.md`):
  that links specs ↔ matrix ↔ tests; this links specs ↔ documentation.
- Enforced the same way as `check:traceability` — a plain-Node script wired
  into `npm run verify` (git hook + CI), so it holds for any agent or human.
- **S05** (privacy): the checker reads local files only; it performs no network
  I/O and reports nothing externally.
