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
- **S12-SR-15** A check's detection predicate MUST track the artifact it
  measures, and a check that can no longer find that artifact MUST be
  detectable mechanically rather than scoring a silent zero. A check whose
  predicate names a specific path is a standing hostage to renames: when the
  agent hooks were ported from shell to Node (S15 requires `.mjs`, not
  `.sh`), five predicates kept looking for the `.sh` names and quietly scored
  0, so the scorer penalised the project **for complying with another of its
  own specs** — and because `maturity:check` was `continue-on-error` in CI,
  nothing failed.

  A test MUST assert that every predicate naming a **committed** path resolves
  against the repository as it stands. Predicates naming a **generated**
  artifact (one no commit contains, e.g. `coverage/coverage-summary.json`,
  which c8 writes during the test run that evaluates this) are exempt: their
  absence is an expected state the scorer already announces with a warning,
  not a rename it fails to notice. The distinction is exactly "silent versus
  announced" — a committed path that has moved is invisible, and that is the
  only thing this requirement is guarding against.
- **S12-SR-16** `maturity:check` MUST distinguish a **broken scorer** from a
  **moved score**, and CI MUST run it as a blocking step rather than
  `continue-on-error`:
  - **Breakage MUST fail** (exit non-zero): `maturity-score.json` missing or
    unreadable, or any scoring check whose path predicate no longer resolves
    (S12-SR-15's silent-zero condition). These mean the number is wrong, not
    merely old.
  - **Score movement MUST NOT fail** (exit 0, reported as a warning), in
    either direction. The score legitimately moves with coverage and with
    every requirement added, so failing on drift would redden pull requests
    that changed nothing about maturity, and — worse — would put the build's
    health behind keeping the number flattering. Refreshing the committed
    snapshot is a prompt, never a gate.

  The asymmetry is the point: CI should stop a scorer that has stopped
  measuring, and stay out of the way of a score that has simply changed.
- **S12-SR-02** The weight justifications MUST live only in
  `scripts/maturity-score.mjs` (flowing into the generated
  `maturity-score.json`); no page under `docs/` may restate a weight, score,
  or justification by hand.

### Maturity Section

- **S12-SR-03** The docs site MUST expose a **Maturity** section reachable
  from the top navigation, containing an overview page, a methodology page,
  and one page per scoring dimension, with a sidebar listing every dimension
  page. Dimension pages MUST be generated from the dimensions present in
  `maturity-score.json` (a rubric change appears on the next build with no
  config edit).
- **S12-SR-13** The section MUST include a **methodology page** explaining, in
  prose: the purpose of the score (a modest, best-effort attempt to measure
  engineering maturity as objectively as possible from observable facts rather
  than judgement); how a score is computed (weighted checks per dimension,
  dimension = 5 × earned/possible, overall = mean of dimensions); that the
  rubric leans on existing external standards where they fit (e.g. OpenSSF
  Scorecard, SLSA, SHA-pinned actions, coverage) and is an explicit checklist
  only where none exists; and — explicitly — that the **rubric itself evolves**,
  so the number is not a reliable absolute or a cross-project certification but
  a self-relative signal that trends toward the most accurate measure the
  project can currently express. The page MUST link to the live scorer
  (`scripts/maturity-score.mjs`) and `MATURITY.md` as the authoritative
  sources, and the overview and dimension pages MUST link to it.
- **S12-SR-14** The **Docs dimension page** MUST additionally render a
  per-spec documentation-coverage chart from the S07 depth metric
  (S07-SR-10..12): for every documentable spec, its actual words against its
  expected words (complexity-derived), with the least-covered specs surfaced
  first and each entry linking to that spec's page. The chart is computed at
  build time from the shared library — no value is hand-maintained.
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

### Score history

- **S12-SR-09** The scorer MUST maintain a **`maturity-history/`** folder at
  the repository root: on a scoring run (not `--check`), when the rounded
  score state (overall and per-dimension scores) differs from the most recent
  history snapshot — or no snapshot exists — it MUST write a new
  timestamp-named snapshot file recording the date, overall score, scale, and
  every dimension's label, slug, and score. A run whose rounded scores are
  unchanged MUST NOT add a file.
- **S12-SR-10** A backfill command MUST reconstruct `maturity-history/` from
  the git history of `maturity-score.json`: one snapshot per commit whose
  rounded score state differs from the preceding one, timestamped from the
  commit date. Re-running the backfill MUST be idempotent for an unchanged
  git history.
- **S12-SR-11** The Maturity overview page MUST render an **evolution
  diagram** from `maturity-history/` at build time: score over time for the
  overall score and every dimension on the 0–5 scale, with the overall series
  visually emphasized. Hovering the diagram MUST reveal every series' value
  at the nearest snapshot, and a dimension's series MUST be highlightable via
  its legend entry, which links to that dimension's page.
- **S12-SR-12** The evolution data MUST also be reachable as text: a table
  listing every snapshot's date, overall score, and per-dimension scores.

## Non-Functional Requirements

- **S12-NFR-01** All Maturity-section content MUST be generated at build time
  from `maturity-score.json` and `maturity-history/` (VitePress data loaders /
  dynamic routes), with no score, weight, or justification duplicated by hand
  under `docs/`. History snapshots are written only by the scorer and the
  backfill command, never by hand.
- **S12-NFR-02** The section MUST build with the existing docs toolchain
  (VitePress, `docs.yml`) with **no new runtime dependency**: the diagram is
  inline SVG rendered by Vue, fully static, with interactivity running
  client-side only.
- **S12-NFR-03** The diagram MUST respect the site theme (light/dark) by
  using the theme's CSS variables rather than hard-coded colors.

## Out of Scope

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
6. Running `npm run maturity` twice in a row adds exactly one history file at
   most (none the second time); running the backfill twice yields the same
   folder contents.
7. The overview page shows the evolution diagram; hovering it reads out every
   score at a snapshot, and activating a legend entry opens that dimension's
   page.
