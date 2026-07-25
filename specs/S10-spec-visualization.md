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
  blank or a zero, so "not scored" is never read as "scored low". The RICE
  cell MUST also carry a proportional bar scaled against the corpus's highest
  RICE ratio, so relative value-per-effort is readable at a glance without
  sorting — the matrix is the project's one RICE ranking surface (S10-SR-12).
- **S10-SR-10** Column visibility MUST be user-controllable through a
  multi-select dropdown listing every column except the spec id, which MUST
  remain visible at all times so a row is always identifiable. The control
  MUST show how many columns are visible, and the choice applies to the table
  only — it MUST NOT change which specs the filters match.
- **S10-SR-16** Every column, including the spec id, MUST be sortable by
  clicking its header: the first click sorts ascending, a second click on the
  same header sorts descending, and a third click returns the table to its
  unsorted (spec-id source) order. The active column and direction MUST be
  indicated visually and via the header's `aria-sort` attribute. Sorting MUST
  NOT change which specs the filters match, only their order, and — echoing
  S10-SR-09 — a row with no estimate for the sorted metric column MUST always
  sort after every scored row, in both directions, so "not scored" is never
  read as "scored low" by appearing at the top of a descending sort.

### Sidebar

- **S10-SR-11** Each spec's sidebar entry MUST carry a compact advisory-metric
  indicator (T-shirt size, and RICE where one exists), so the estimates are
  comparable while browsing without opening each page. The indicator MUST be
  built from the same build-time data as the matrix, never hand-maintained.

### Insights Page

- **S10-SR-12** The Specs section MUST include an **insights** page reporting
  corpus-level KPIs derived from the spec artifacts: requirement and spec
  totals, the status breakdown, documentation and test-tag coverage, total and
  mean effort, and the value-tier and effort-size distributions. Every figure
  MUST be derived at build time from `specs/` (S10-NFR-01). The page MUST NOT
  reproduce the per-spec metric listing the matrix page already serves:
  ranking feature specs by RICE is the matrix's job (its RICE column sorts,
  per S10-SR-16, and carries the proportional bar, per S10-SR-09), and a
  second rendering of the same list would be two tables to keep in step.
- **S10-SR-13** The insights page MUST label the effort- and value-derived
  figures as **advisory estimates** and visually separate them from the
  counted facts (requirements, statuses, coverage), so a judgement is never
  presented as a measurement.
- **S10-SR-17** The insights page MUST present the corpus graphically, not
  only as numbers: the counted-facts section MUST include a per-spec stacked
  bar chart of requirements by status, using the same status colors as the
  status badges so the two read as one system; the advisory section MUST
  include a value-versus-effort scatter plot of the scored feature specs,
  with the S16 tier bands marked on the value axis and constant-RICE guide
  lines so value-per-effort is readable as slope; and the value-tier and
  effort-size distributions MUST be rendered as labelled count bars. Charts
  MUST be built from the same build-time data as the rest of the page
  (S10-NFR-01) with no new runtime dependency or chart library (S10-NFR-02).
  Every mark MUST expose its exact values (tooltip or visible label) so a
  graphic never replaces the numbers with an impression, and marks that would
  sit at identical coordinates MUST merge into one mark naming all of them
  rather than overplot.

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
  section. Note this is *not* the only failure mode a shallow checkout causes:
  in a `--depth 1` clone, `git log --follow` on a file the tip commit never
  touched can still report that tip commit as if it were part of the file's
  history (a shallow-boundary quirk, not a bug in this feature's own code) —
  silently wrong, not merely empty, and so not caught by this requirement's
  fallback at all. `docs.yml`'s checkout MUST use `fetch-depth: 0` for exactly
  this reason: it's a correctness requirement for S10-SR-14, not just a
  convenience for completeness.

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
7. The insights page's requirement total equals the matrix's, and sorting the
   matrix's RICE column descending yields the same order as
   `npm run spec-value:report`; the insights page itself contains no per-spec
   RICE listing.
8. Each spec page shows a "Changes over time" list of commits touching that
   spec's file, newest first, each linking to the commit on the repository
   host; a spec file with no discoverable history shows the explicit empty
   state instead.
9. Clicking the "Effort" header sorts the table by effort points ascending
   with unscored specs last; clicking it again reverses to descending with
   unscored specs still last; a third click restores the original order.
10. The insights page renders the requirements-by-status stacked chart and the
    value-versus-effort scatter; every scored feature appears in the scatter
    exactly once (co-located features share one labelled mark), and adding a
    requirement to `traceability.json` changes the status chart on the next
    build with no edit under `docs/`.

## History

- 2026-07-25 — Added S10-SR-14/15: a per-spec "changes over time" section
  sourced from `git log` on the spec file itself, so browsing a spec's page
  shows its evolution without needing to leave the docs site for the
  repository's commit history.
- 2026-07-25 — `docs.yml`'s checkout was still the default `fetch-depth: 1`
  (shallow) when this shipped. Verified in a real `--depth 1` clone that this
  is worse than S10-SR-15's "no history" fallback: `git log --follow` on a
  file the tip commit never touched still reported that tip commit as the
  file's history — every spec page would have shown the same one
  build-time-irrelevant commit, not an empty/fallback state. Fixed by adding
  `fetch-depth: 0` to `docs.yml`'s checkout step; S10-SR-15 amended to record
  the failure mode so a future shallow-checkout regression is recognized.
- 2026-07-25 — Added S10-SR-16: click-to-sort matrix columns (asc/desc/
  unsorted cycle, `aria-sort` indicator), with unscored effort/value/RICE
  rows always sorting after scored ones regardless of direction.
- 2026-07-25 — Amended S10-SR-09/12 and added S10-SR-17: the insights page's
  RICE ranking table duplicated the matrix once S10-SR-16 made the RICE
  column sortable, so the list moved out — the matrix's RICE cell gained the
  proportional bar the table alone had — and the insights page now carries
  charts instead: per-spec requirements-by-status stacked bars, a
  value-versus-effort scatter with S16 tier bands and constant-RICE guides,
  and count bars for the tier and effort-size distributions.
