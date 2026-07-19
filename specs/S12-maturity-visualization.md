# S12 — Maturity Scorecard Visualization on the Docs Site

## Overview

The project's engineering/AI-integration maturity is **computed** by
`scripts/maturity-score.mjs` and committed as `maturity-score.json`
(see `MATURITY.md`). Today that result is only visible as a static SVG chart
and a JSON file in the repository. This spec puts the scorecard on the
VitePress docs site: a **Maturity** section with an overview page showing the
overall score and an **interactive diagram** of the dimension scores, plus one
browsable page per scoring dimension ("criteria page") that lists every check
with its **weight and a written justification for that weight** — all
generated at build time from `maturity-score.json`, never hand-copied, so the
site cannot drift from the committed score.

The weight justifications are new content. To keep the rubric's single source
of truth intact (constitution/AGENTS.md: scores and checks live in
`scripts/maturity-score.mjs`), the justifications are authored **in the scorer
script alongside the checks they explain** and emitted into
`maturity-score.json`; the docs site only renders them.

## User Stories

- As a visitor, I want to see the project's maturity at a glance as a diagram,
  not a JSON file, so I can judge the project's engineering health quickly.
- As a contributor, I want to click a dimension in the diagram and land on a
  page explaining what that dimension measures, how each check is weighted,
  and *why* it carries that weight, so the rubric is legible and contestable.
- As a maintainer, I want the site to re-render from `maturity-score.json` on
  every docs build so the published diagram never disagrees with the committed
  score.

## Functional Requirements

### Scorer metadata

- **S12-SR-01** Every scoring dimension in `scripts/maturity-score.mjs` MUST
  declare a URL-safe `slug` and a one-paragraph `description` of what the
  dimension measures, and every check MUST declare a `why` string justifying
  its point weight relative to its dimension's other checks. All three MUST be
  emitted into `maturity-score.json` by `npm run maturity`.
- **S12-SR-02** The weight justifications MUST live only in
  `scripts/maturity-score.mjs` (flowing into the generated
  `maturity-score.json`); no page under `docs/` may restate a weight, score,
  or justification by hand.

### Maturity Section

- **S12-SR-03** The docs site MUST expose a **Maturity** section reachable
  from the top navigation, containing an overview page and one page per
  scoring dimension, with a sidebar listing every dimension page. Dimension
  pages MUST be generated from the dimensions present in
  `maturity-score.json` (a rubric change appears on the next build with no
  config edit).
- **S12-SR-04** The overview page MUST show the overall score, the snapshot
  date, and an **interactive diagram** of all dimension scores on the 0–5
  scale: hovering or focusing a dimension MUST reveal its exact score, and
  activating a dimension (click or keyboard) MUST navigate to that
  dimension's page.
- **S12-SR-05** The diagram MUST degrade accessibly: the same scores MUST be
  reachable as text (an accessible per-dimension score listing with links to
  the dimension pages), and interactive elements MUST be keyboard-focusable
  with accessible names.

### Criteria (dimension) pages

- **S12-SR-06** Each dimension page MUST show the dimension's description,
  its current score out of 5, and every check of that dimension with: its
  weight (points), points earned, the observable fact it reads (the check
  `note`), and the weight justification (`why`).
- **S12-SR-07** Each check on a dimension page MUST have a stable URL anchor
  derived from its check id, so a specific criterion can be linked directly.
- **S12-SR-08** Checks skipped by the scorer for the committed snapshot (e.g.
  the OpenSSF grade when its cache is absent) MUST still be listed on the
  dimension page — marked as not counted in the committed score — because the
  rubric documents them even when a snapshot omits them.

## Non-Functional Requirements

- **S12-NFR-01** All Maturity-section content MUST be generated at build time
  from `maturity-score.json` (VitePress data loader / dynamic routes), with
  no score, weight, or justification duplicated by hand under `docs/`.
- **S12-NFR-02** The section MUST build with the existing docs toolchain
  (VitePress, `docs.yml`) with **no new runtime dependency**: the diagram is
  inline SVG rendered by Vue, fully static, with interactivity running
  client-side only.
- **S12-NFR-03** The diagram MUST respect the site theme (light/dark) by
  using the theme's CSS variables rather than hard-coded colors.

## Out of Scope

- Plotting score *history* over time — `maturity-score.json` holds only the
  current snapshot; a time series would need new data collection first.
- Re-computing scores in the browser — the committed JSON is the only input.
- Replacing the static scorecard SVGs used by `MATURITY.md`/README — they
  remain for contexts that cannot run Vue (GitHub-rendered markdown).

## Acceptance Criteria

1. `npm run maturity` writes `maturity-score.json` containing `slug`,
   `description`, and per-check `why` fields, and `npm run maturity:check`
   still passes on the committed result.
2. `npm run build` in `docs/` emits `/maturity/` and one page per dimension
   slug; deleting a dimension from the JSON would drop its page on the next
   build with no edit under `docs/`.
3. On the overview page, hovering a dimension in the diagram shows its score,
   and clicking it opens that dimension's page; the same navigation is
   possible with the keyboard alone.
4. A dimension page lists all of its checks with points, earned points, note,
   and justification, each under a stable anchor.
5. `npm run check:doc-traceability` passes with the new pages tagged
   `<!-- spec:S12 -->`.
