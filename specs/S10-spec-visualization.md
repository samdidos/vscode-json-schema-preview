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
  kind, and searchable by free text over spec ID and title. Filtering by a
  status shows the specs that have at least one requirement in that status.
- **S10-SR-05** Each spec listed in the table MUST link to that spec's page.

### Spec Pages

- **S10-SR-06** Each spec page MUST render the full content of the
  corresponding `specs/*.md` file, with relative links to sibling spec files
  rewritten to the sibling's docs-site page.
- **S10-SR-07** Each spec page MUST include a requirement traceability table
  for that spec's requirements: ID, status, implementing files (linked to the
  repository), and the matrix note.

## Non-Functional Requirements

- **S10-NFR-01** All Specs-section content MUST be generated at build time
  from `specs/*.md` and `specs/traceability.json` (VitePress data loaders /
  dynamic routes). No spec text, requirement list, or status value may be
  duplicated by hand into `docs/` — a change to `specs/` is reflected by the
  next docs build with no manual step.
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
   `/specs/matrix`, and one page per `specs/[FS]*.md` file.
2. Adding a requirement to a spec and its entry to `traceability.json`
   changes the matrix table on the next build with no edit under `docs/`.
3. Selecting the `planned` status filter hides every spec whose requirements
   are all `implemented`/`manual`.
4. Clicking a spec ID in the matrix opens that spec's page, whose traceability
   table matches the matrix entries for that spec.
5. `npm run check:doc-traceability` passes with the new pages tagged
   `<!-- spec:S10 -->` (and the guidelines page additionally tagged for the
   traceability conventions it documents).
