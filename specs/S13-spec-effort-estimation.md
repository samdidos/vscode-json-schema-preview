# S13 — Spec Effort Estimation (Advisory)

## Overview

An **advisory effort estimate** for every spec, in the three formats agile
teams actually use — **Fibonacci story points**, **T-shirt size**, and a
**human-hour band** — committed to `specs/effort.json` and shown on each
spec's docs-site page.

Effort is a *judgement*, not an observable fact, so this layer is explicitly
fenced off from the maturity score (S12): the scorer never reads it, and every
estimate carries provenance saying who estimated it, when, under which rubric
version, and from what evidence. What *makes* the judgement as deterministic
as a judgement can be is the calibration procedure below: a single authored
value (points) anchored to a computed evidence band, with the other two
formats **derived** — never separately invented — and any deviation from the
evidence band bounded to one Fibonacci step and justified by an enumerated
factor code.

Because this repository's specs are implemented, estimation here is
*retrospective*: the evidence (implementation size, test surface) is read from
the finished work, which grounds the bands far better than up-front guessing.
For future, not-yet-implemented specs the same rubric applies with evidence
from comparable existing specs (planning-poker style relative sizing).

## The calibration chart (rubric v1)

**One estimate, three views.** Fibonacci points are the only authored value;
T-shirt size and hours follow mechanically:

| Points | T-shirt | Human-hours* | Reads as |
|---|---|---|---|
| 1 | XS | ≤ 2 h | trivial — one file, established idioms |
| 2 | S | 2–4 h | small — a few files, no new concepts |
| 3 | S | 4–8 h | half-day to a day, one subsystem |
| 5 | M | 8–16 h | 1–2 days — new module with tests + docs |
| 8 | L | 16–32 h | 2–4 days — several subsystems, some new concepts |
| 13 | XL | 32–80 h | 1–2 weeks — cross-cutting or infrastructure-heavy |
| 21 | XXL | 80 h+ | epic — should have been split |

\* Hours are calibrated to **one experienced developer working solo, without
AI assistance**, including tests, documentation, and spec work — the
industry's common mental anchor. Actual wall-clock in this repository (agent
+ human) is substantially lower; the anchor is kept because it is the one
readers can compare against their own experience.

**Evidence → base points.** The starting band comes from the total lines of
the spec's implementing files (the `impl` paths in `specs/traceability.json`):

| Implementation LOC | Base points |
|---|---|
| ≤ 150 | 1 |
| 151–400 | 2 |
| 401–800 | 3 |
| 801–1500 | 5 |
| 1501–2500 | 8 |
| 2501–4000 | 13 |
| > 4000 | 21 |

**Bounded adjustment.** The final points may deviate from the base by **at
most one Fibonacci step**, and only with one or more of these factor codes
(recorded with the estimate):

| Code | Direction | Meaning |
|---|---|---|
| `NOVEL` | +1 step | new algorithm/semantics beyond the repo's established patterns |
| `EXT` | +1 step | external service integration: auth, network failure modes |
| `UI` | +1 step | interactive webview/visual surface (often coverage-excluded, so LOC understates it) |
| `INFRA` | +1 step | infrastructure/scaffolding effort invisible in LOC (CI harnesses, subprocess management) |
| `GEN` | −1 step | LOC inflated by generated or derived content |
| `PATTERN` | −1 step | straightforward repeat of an established repo pattern; leverage from an existing engine/library |

LOC is a famously imperfect effort proxy — the band table and the one-step
bound exist precisely so the imperfection is *contained and visible* instead
of silently absorbed into a free-hand guess.

## Functional Requirements

- **S13-SR-01** Every spec MUST have an effort estimate in
  `specs/effort.json` expressed as Fibonacci story points
  (1, 2, 3, 5, 8, 13, 21), with T-shirt size and human-hour band **derived**
  from the points via the calibration chart above — the three formats MUST
  NOT be authorable independently.
- **S13-SR-02** Each estimate MUST record its provenance and reasoning: the
  computed base points, the evidence snapshot they came from (implementation
  LOC, file count, `[ID]`-tagged test count, requirement count), any
  adjustment factor codes from the enumerated set, a one-line justification,
  the estimator, the estimation date, and the rubric version.
- **S13-SR-03** A validator (`npm run check:spec-effort`, wired into
  `npm run verify`) MUST fail on: a spec without an estimate, a non-Fibonacci
  value, a derived field that contradicts the calibration chart, a base that
  contradicts the recorded evidence's LOC band, an adjustment further than
  one Fibonacci step from the base, or an unknown factor code. It MUST warn
  (not fail) when *live* evidence has drifted into a different band than the
  recorded snapshot — a prompt to re-estimate, not a broken build.
- **S13-SR-04** The calibration constants (Fibonacci set, LOC bands, T-shirt
  and hour mappings, factor codes) MUST be declared once in the validator
  script and mirrored by the chart in this spec; the validator is the
  machine-readable authority.
- **S13-SR-05** Each spec's docs-site page MUST show its estimate — points,
  T-shirt size, hour band, factors, and justification — visibly labelled as
  an **advisory estimate** with its estimator and date, linking to this
  spec's page for the rubric.

## Non-Functional Requirements

- **S13-NFR-01** Effort estimates MUST NOT influence the maturity score in
  any way: `scripts/maturity-score.mjs` MUST NOT read `specs/effort.json`,
  and no maturity check may be derived from it. The estimate is planning
  advice, not a measured fact — mixing it into the score would break the
  score's "observable facts only" guarantee.
- **S13-NFR-02** The validator MUST be plain Node with no third-party
  dependencies, like the repository's other checkers, and `effort.json` MUST
  remain tool-neutral JSON any agent or human can edit.

## Out of Scope

- Velocity tracking, burndown, or any time-series of estimates.
- Estimating individual requirements — the spec is the estimation unit.
- Treating the hour band as a commitment; it is a calibration anchor.

## Acceptance Criteria

1. `specs/effort.json` contains an estimate for every spec file, and
   `npm run check:spec-effort` passes.
2. Changing a T-shirt size by hand to contradict its points fails the
   validator; setting points two Fibonacci steps from the base fails; adding
   an unknown factor code fails.
3. A spec page on the docs site shows its estimate labelled "advisory", with
   factors and justification, linking to this spec.
4. `scripts/maturity-score.mjs` contains no reference to `effort.json`, and
   `npm run maturity` output is byte-identical whether or not
   `specs/effort.json` exists.
