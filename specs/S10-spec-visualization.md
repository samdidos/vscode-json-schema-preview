# S10 — Spec Visualization on the Docs Site

## Overview

The RFC-2119 specs (`specs/*.md`) and the requirement traceability matrix
(`specs/traceability.json`) are the project's source of truth, but they are
only readable as raw files in the repository. This spec puts them on the
VitePress docs site: a **Specs** section with a guidelines page (how the
spec-driven workflow works), a filterable matrix table, and one browsable page
per spec — all **generated at build time from the files in `specs/`**, never
hand-copied, so the site cannot drift from the repository.

There is no Spec Kit (or other) standard for visualizing a spec corpus — Spec
Kit defines an authoring workflow (specify → plan → tasks), not a publishing
format — so this spec defines the project's own minimal presentation layer on
top of the existing artifacts.

## User Stories

- As a contributor, I want to browse the specs and their implementation status
  on the docs site so I don't have to read raw markdown and JSON in the repo.
- As a maintainer, I want to filter the matrix by status (e.g. `planned`) to
  see at a glance what is specified but not yet built.
- As a newcomer, I want a page that explains how the spec-driven workflow
  works (IDs, statuses, test tags, checkers) before I make my first change.

## Functional Requirements

### Specs Section

- **S10-SR-01** The docs site MUST expose a **Specs** section reachable from
  the top navigation, containing at minimum: a guidelines page explaining the
  spec-driven workflow, a matrix page, and one page per spec file.
- **S10-SR-02** The guidelines page MUST describe: the RFC-2119 key-word
  convention, requirement IDs and where they are defined, the five matrix
  statuses and their meanings, `[ID]` test tags, `<!-- spec:… -->`
  documentation tags, and the checkers that enforce them
  (`check:traceability`, `check:doc-traceability`).

### Matrix Page

- **S10-SR-03** The matrix page MUST render a table listing every spec, with
  its ID, title, kind (feature/system), and a per-status breakdown of its
  requirements, derived from `specs/traceability.json`.
- **S10-SR-04** The table MUST be filterable by requirement status and by spec
  kind, and searchable by free text over spec ID and title. Status and kind
  each MUST be presented as a **multi-select dropdown** (a labelled control
  that opens a checkbox list), so several values can be active at once. Within
  one dropdown the selected values combine as OR (a spec matches if it has at
  least one requirement in any selected status; a spec matches if its kind is
  any selected kind); the two dropdowns and the search box combine as AND. An
  **empty** dropdown applies no constraint for that dimension (all values
  pass), and the control MUST show how many values are active.
- **S10-SR-05** Each spec listed in the table MUST link to that spec's page.
- **S10-SR-09** The matrix table MUST show the advisory estimates alongside
  the status breakdown as columns: effort points and T-shirt size (S13), and
  for feature specs the customer-value score, tier and RICE ratio (S16). A
  spec with no such estimate MUST render an explicit placeholder rather than a
  blank or a zero, so "not scored" is never read as "scored low".
- **S10-SR-10** Column visibility MUST be user-controllable through a
  multi-select dropdown listing every column except the spec id, which MUST
  remain visible at all times so a row is always identifiable. The control
  MUST show how many columns are visible, and the choice applies to the table
  only — it MUST NOT change which specs the filters match.

### Sidebar

- **S10-SR-11** Each spec's sidebar entry MUST carry a compact advisory-metric
  indicator (T-shirt size, and RICE where one exists), so the estimates are
  comparable while browsing without opening each page. The indicator MUST be
  built from the same build-time data as the matrix, never hand-maintained.

### Insights Page

- **S10-SR-12** The Specs section MUST include an **insights** page reporting
  corpus-level KPIs derived from the spec artifacts: requirement and spec
  totals, the status breakdown, documentation and test-tag coverage, total and
  mean effort, the value-tier distribution, and a ranking of feature specs by
  RICE. Every figure MUST be derived at build time from `specs/` (S10-NFR-01).
- **S10-SR-13** The insights page MUST label the effort- and value-derived
  figures as **advisory estimates** and visually separate them from the
  counted facts (requirements, statuses, coverage), so a judgement is never
  presented as a measurement.

### Spec Pages

- **S10-SR-06** Each spec page MUST render the full content of the
  corresponding `specs/*.md` file, with relative links to sibling spec files
  rewritten to the sibling's docs-site page.
- **S10-SR-07** Each spec page MUST include a requirement traceability table
  for that spec's requirements: ID, status, implementing files (linked to the
  repository), and the matrix note.
- **S10-SR-08** Each spec page MUST list the **documentation sections** that
  carry that spec's `<!-- spec:… -->` tags (S07), showing for each: the source
  document, the nearest heading, and the attributed word count — linking
  docs-site pages to the page and nearest anchor, and repository-only
  documents (e.g. `README.md`) to the file on the repository host. The list is
  derived at build time from the S07 depth-metric library (S07-SR-13), never
  hand-maintained, and a spec with no tagged section shows its expected word
  count as the gap to fill.

### Changes Over Time

- **S10-SR-14** Each spec page MUST render a **changes over time** section
  listing every commit that has touched that spec's `specs/*.md` file, newest
  first: short hash, date, and subject line, each linking to that commit on
  the repository host. The list MUST be derived at build time from the file's
  own `git log` history (following renames) — never a hand-maintained
  changelog — so it can never drift from what actually happened to the file.
- **S10-SR-15** A spec file with no history available at build time (e.g. a
  shallow checkout with the commit outside the fetched depth) MUST render an
  explicit "no history available" state rather than an empty or misleading
  section.

## Non-Functional Requirements

- **S10-NFR-01** All Specs-section content MUST be generated at build time
  from `specs/*.md`, `specs/traceability.json`, and (for S10-SR-14) the git
  history of each spec file (VitePress data loaders / dynamic routes). No
  spec text, requirement list, status value, or change history may be
  duplicated by hand into `docs/` — a change to `specs/` (or a new commit
  touching it) is reflected by the next docs build with no manual step.
- **S10-NFR-02** The section MUST build with the existing docs toolchain
  (VitePress, `docs.yml` workflow) with no new runtime services; pages are
  fully static and filtering runs client-side.

## Out of Scope

- Visualizing per-requirement *test* coverage (which tests carry a given
  `[ID]` tag) — the checker discovers this at verify time; surfacing it on the
  site is future work.
- Editing or annotating specs from the site — the repository remains the only
  write path.
- Rendering `.specify/` artifacts (constitution, templates) — only `specs/`
  is published.

## Acceptance Criteria

1. `npm run build` in `docs/` succeeds and emits `/specs/` (guidelines),
   `/specs/matrix`, `/specs/insights`, and one page per `specs/[FS]*.md` file.
2. Adding a requirement to a spec and its entry to `traceability.json`
   changes the matrix table on the next build with no edit under `docs/`.
3. Selecting the `planned` status filter hides every spec whose requirements
   are all `implemented`/`manual`.
4. Clicking a spec ID in the matrix opens that spec's page, whose traceability
   table matches the matrix entries for that spec.
5. `npm run check:doc-traceability` passes with the new pages tagged
   `<!-- spec:S10 -->` (and the guidelines page additionally tagged for the
   traceability conventions it documents).
6. Unchecking a column in the matrix's column dropdown removes it from the
   table while the spec id column stays; the row count is unchanged.
7. The insights page's requirement total equals the matrix's, and its RICE
   ranking matches `npm run spec-value:report`.
8. Each spec page shows a "Changes over time" list of commits touching that
   spec's file, newest first, each linking to the commit on the repository
   host; a spec file with no discoverable history shows the explicit empty
   state instead.

## History

- 2026-07-25 — Added S10-SR-14/15: a per-spec "changes over time" section
  sourced from `git log` on the spec file itself, so browsing a spec's page
  shows its evolution without needing to leave the docs site for the
  repository's commit history.
