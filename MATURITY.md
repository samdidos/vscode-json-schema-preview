# Project Maturity Scorecard

A **computed**, dated record of this project's engineering and AI-agent-integration
maturity — so improvements (and regressions) are visible over time instead of
living in chat history or someone's judgement.

Every score is produced by [`scripts/maturity-score.mjs`](scripts/maturity-score.mjs)
from **observable facts** in the repository (coverage numbers, workflow config,
the traceability matrix, file presence, lint output) — never a hand-set number.
Each dimension is a weighted list of checks; its score is
`5 × (points earned / points possible)`, and the overall score is the mean of
the dimensions. The machine-readable result, including the per-check breakdown,
is committed as [`maturity-score.json`](maturity-score.json).

> This is a **self-relative** rubric: it tracks *this repo's* trend, and is not a
> certification you can compare against another project's number. Where an
> external standard exists and fits (SHA-pinned actions, presence of
> CodeQL/OpenSSF Scorecard/SLSA, coverage percentages) the check reads that
> signal directly; where none does (AI-agent integration) it is an explicit
> presence checklist, documented below, not a vibe.

**Snapshot: 2026-08-04**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/public/maturity-scorecard-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/public/maturity-scorecard-light.svg">
  <img alt="Project Maturity Scorecard: a horizontal bar chart of the overall score and each dimension (Spec & process, Testing, Security / supply chain, CI/CD & release, Docs, Code quality, AI-agent integration), each out of 5. Current values are in maturity-score.json." src="docs/public/maturity-scorecard-light.svg">
</picture>

Regenerate both the JSON and the chart with **`npm run maturity`** (run
`npm test` first so the Testing dimension can read fresh coverage). CI runs
`npm run maturity:check`, which warns (non-blocking) if the committed
`maturity-score.json` is stale — so drift gets flagged without holding up
an otherwise-good PR.

## The rubric — what each dimension measures

Weights are points; a dimension's checks sum to its "possible" column. Numeric
checks (coverage, lint warnings, pin ratio) earn a fraction of their points
against the target shown.

Each check also carries a written **justification for its weight** (`why` in
the scorer, emitted into `maturity-score.json`), rendered on the docs site's
[Maturity section](https://samdidos.github.io/vscode-json-schema-preview/maturity/)
alongside an interactive diagram of the dimension scores. Score **history**
lives in [`maturity-history/`](maturity-history/): the scorer appends a
timestamped snapshot whenever the rounded scores change (past changes were
backfilled from git history via `npm run maturity:backfill`), and the docs
site plots the evolution over time from that folder. <!-- spec:S12 -->

| Dimension | Checks (points) |
|---|---|
| **Spec & process** | `check:traceability` passes (4) · zero untracked requirements (2) · the verify gate runs traceability (2) · constitution present (1) · ≥ 10 spec files (1) |
| **Testing** | branch coverage vs 95% (3) · line coverage vs 95% (2) · function coverage vs 95% (1) · mutation `break` threshold set (2) · low coverage-exclusion ratio (2) |
| **Security / supply chain** | CodeQL workflow (2) · OpenSSF Scorecard workflow (2) · Dependabot (1) · SLSA/provenance/attestation in a workflow (2) · GitHub Actions pinned to a full SHA, as a ratio (3) · **live OpenSSF Scorecard grade /10 (4, when cached — see below)** |
| **CI/CD & release** | CI workflow present (1) · no `continue-on-error` job (2) · release-please (2) · commitlint + commit-msg hook (2) · pre-commit hook runs verify (2) · knip runs in CI (1) |
| **Docs** | README (1) · CONTRIBUTING (1) · CODE_OF_CONDUCT (1) · SECURITY (1) · LICENSE (1) · docs site (1) · documentation depth: mean per-spec tagged words vs complexity-expected words (3) · MATURITY.md (1) |
| **Code quality** | TS strict (2) · zero lint errors (2) · lint warnings vs a 200 ceiling (3) · knip clean (2) · bundler configured (1) |
| **AI-agent integration** | AGENTS.md (1) · CLAUDE.md imports it (1) · spec-prompt hook (1) · pre-commit agent hook (1) · coverage agent hook (1) · session bootstrap script + hook (1) · permissions allowlist (1) · `.mcp.json` (1) · PR template asks for requirement IDs (1) · machine-readable build state (1) |

The dimensions currently lowest are **CI/CD & release** (three deliberately
non-blocking `continue-on-error` jobs — a values trade-off, not an accident),
**Security / supply chain** (the cached OpenSSF Scorecard grade is 5.1/10),
and **Docs** (specs are ~43% documented by the depth metric). All are honest,
mechanical signals: raise the Scorecard grade, write the missing spec
documentation (the docs site's Docs dimension page lists the least-covered
specs), and the score follows on the next `npm run maturity`.

## Known limitations of the current metrics

- **The live OpenSSF Scorecard grade is *optional and cached*, not fetched
  inline.** `npm run maturity:ossf` (`scripts/fetch-ossf-scorecard.mjs`) hits
  api.securityscorecards.dev and writes `ossf-scorecard.json`; the scorer then
  folds that grade in as a 4-point Security check worth `4 × grade/10`. This is
  the one networked step, kept separate so the scorer stays offline and
  `maturity:check` stays reproducible — where there is no cache (e.g. a sandbox
  with no egress to that host), the check is **skipped entirely** (dropped from
  both earned and possible), so its absence never distorts the score. The
  committed cache currently carries a 5.1/10 grade; run `maturity:ossf` where
  the API is reachable, then `npm run maturity`, to refresh it.
- **Mutation quality isn't scored, only its `break` threshold.** The threshold
  `60` in `stryker.config.json` was set from the tool's pre-existing "low" bound,
  not a measured run (a full Stryker pass is expensive). The score credits that a
  gate *exists*, not that the suite hits a specific mutation score.
- **"Coverage vs 95%" and "warnings vs 200" targets are chosen, not derived.**
  They're transparent knobs in `maturity-score.mjs`; adjust them there if the
  team picks different targets, and the History note should say so.
- **The documentation-depth expectation is a chosen model, not a law.** The
  Docs dimension's depth check (`scripts/doc-coverage-lib.mjs`) expects
  `40 words × evaluated complexity` (floor 120) per spec, where complexity is
  evaluated per documentable requirement as kind-weight (FR/SR 1.0, NFR 0.4)
  × the requirement definition's length normalized by the corpus median
  (clamped ×0.5–×2), and counts the words attributed through
  `<!-- spec:… -->` tags (S07-SR-10..12). The evaluation reads only the spec
  corpus — no hand-set weight — but every constant is a calibrated knob
  declared in one place; tune them there and note it in the History.

## History

- **2026-07-04 (morning)** — Baseline assessment (by hand at this point): 4.2/5
  engineering, 4/5 AI-integration. Identified gaps: no spec-checking prompt hook,
  no NFR coverage for reliability/privacy/performance budgets, no session
  bootstrap, no permission allowlist, undocumented footguns, `break: null`
  mutation testing, non-blocking knip, no PR template, no portable MCP config,
  8 files excluded from coverage for being "VS Code-adjacent" without checking.
- **2026-07-04 (midday)** — Added the `UserPromptSubmit` spec-gate hook;
  `S03-performance.md` got concrete timeout/latency budgets; new
  `S04-reliability.md` and `S05-privacy.md` specs; `npm run verify` now runs
  `check:traceability`.
- **2026-07-04 (afternoon)** — Implemented configurable timeouts, offline
  stale-cache fallback, and a pure-JS fallback renderer; added
  `S06-accessibility.md`; re-synced the constitution's Article IV table.
  Backfilled all 150 previously-`untracked` requirements to `implemented`/`manual`.
- **2026-07-04 (evening)** — Session bootstrap script + `SessionStart` hook;
  permissions allowlist; footgun docs in `AGENTS.md`.
- **2026-07-04 (night)** — knip CI job made blocking; Stryker `break` threshold
  set; PR template requiring requirement IDs; `.mcp.json`; brought 5 formerly
  "VS Code-adjacent" classes into full coverage, cutting the exclusion list from
  8 files to 3; hand-scored scorecard + chart added.
- **2026-07-04 (late)** — Replaced the hand-scored table with an **automated
  scorer** (`scripts/maturity-score.mjs`): every dimension is now computed from
  observable facts and committed to `maturity-score.json`, the chart renders from
  that JSON, and `npm run maturity:check` gates drift in CI. First computed
  snapshot: overall **4.7** (Spec & process 5.0, CI/CD 5.0, AI-agent 5.0,
  Security 4.9, Testing 4.7, Docs 4.0, Code quality 4.0).
- **2026-07-04 (late+1)** — Added an optional live **OpenSSF Scorecard grade**
  as a cached Security check (`scripts/fetch-ossf-scorecard.mjs` →
  `ossf-scorecard.json`, folded in as `4 × grade/10`). It is skipped when
  uncached, so the offline scorer stays deterministic and this snapshot is
  unchanged; it activates once `npm run maturity:ossf` runs where
  api.securityscorecards.dev is reachable.
- **2026-07-10** — `npm run maturity:check`'s CI step is now `continue-on-error:
  true` (`.github/workflows/ci.yml`, `build` job): drift still surfaces as a
  visible warning, but no longer fails the build. The scorer and its rubric
  are unchanged.
- **2026-07-19** — The scorecard is now **visualized on the docs site** (spec
  `S12`): a Maturity section with an interactive dimension diagram and one
  page per dimension. To support it, every check in `maturity-score.mjs`
  gained a `why` field justifying its point weight, and every dimension a
  `slug` + `description` — all emitted into `maturity-score.json`. Checks
  skipped for a snapshot (the uncached OSSF grade) are now *listed* in the
  JSON flagged `skipped` instead of omitted, still excluded from
  earned/possible. No check, weight, or threshold changed, so scores are
  unaffected.
- **2026-07-20** — **Evaluated spec complexity** (S07-SR-11 revised): the
  depth metric's expectation is no longer a flat
  `40 × requirement count` — each documentable requirement now contributes
  kind-weight (FR/SR 1.0, NFR 0.4) × its definition's length relative to the
  corpus median (clamped ×0.5–×2), so a spec of dense, user-facing
  requirements expects more documentation than one of terse internal rules.
  Derived entirely from the spec corpus; per-spec complexity is shown on the
  docs site. Mean coverage barely moved (≈42%), so scores are unchanged —
  expectations are just distributed more fairly.
- **2026-07-19 (later still)** — **Docs depth metric** (S07-SR-10..13): the
  Docs dimension's 3-point depth check now scores **mean per-spec
  documentation coverage** — words attributed to each spec through its
  `<!-- spec:… -->` tags versus `40 words × documentable requirements`
  (floor 120) — replacing the guide-page-to-feature-count ratio, which a stub
  page could satisfy. Computed by the new shared `scripts/doc-coverage-lib.mjs`
  (also rendered on the docs site: per-spec chart on the Docs dimension page,
  "documented in" links on each spec page). Also: fixed the `pinned-actions`
  check's regex, which miscounted `statuses: write` permission lines as
  unpinned actions (ratio was understated), and hardened the three workflows
  with top-level `contents: write` tokens down to read-only top-level with
  job-scoped writes (OpenSSF Token-Permissions).
- **2026-07-19 (later)** — Score history: the scorer now records a snapshot in
  **`maturity-history/`** each time the rounded scores change, the 13 past
  score states were backfilled from the git history of `maturity-score.json`
  (`npm run maturity:backfill`), and the docs site's Maturity page gained an
  **evolution-over-time diagram** rendered from that folder. Scoring itself is
  unchanged.

## Maintaining this file

The scores maintain themselves — `npm run maturity` recomputes `maturity-score.json`
and both chart SVGs from the current repo state. Don't hand-edit scores; change
the *checks or targets* in `scripts/maturity-score.mjs` if the rubric should
change, and add a History entry explaining why. Append to History rather than
rewriting it; the snapshot date and the prose in "The rubric" / "Known
limitations" are the only parts edited in place.
