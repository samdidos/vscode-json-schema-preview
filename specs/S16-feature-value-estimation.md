# S16 — Feature Value Estimation (Advisory)

## Overview

An **advisory customer-value estimate** for every feature spec, committed to
`specs/value.json` and shown on each feature's docs-site page. Where S13 asks
*what does this cost to build?*, this spec asks *what is it worth to the
person using it?* — and pairs the two into a value-per-effort ranking.

The model is **RICE** (Reach × Impact × Confidence ÷ Effort), published by
Intercom in 2016 and in open, vendor-neutral use since — chosen over inventing
a bespoke formula because the project prefers open standards it can hand to
any agent or human. Two adaptations are forced by this repository:

1. **Reach is a band, not a headcount.** RICE expects "N users per quarter".
   This project collects **zero telemetry by design** (S05), so no such number
   exists or ever will. Reach is therefore a 1–5 share band, and the honesty
   about that lives in the Confidence multiplier rather than in a fabricated
   count.
2. **Effort is reused, not re-estimated.** The divisor is the S13 story-point
   estimate already committed in `specs/effort.json`. Inventing a second
   effort number would create two sources of truth that could disagree.

Value is a *judgement* — more so than effort, which at least has implementation
LOC to anchor it. This layer is therefore fenced off from the maturity score
(S12) exactly as S13 is: the scorer never reads it, and every estimate carries
provenance saying who estimated it, when, and under which rubric version. What
discipline exists comes from the same device S13 uses: authored dimensions on
enumerated scales, a **derived** score that cannot be hand-written, and any
deviation bounded and justified by an enumerated factor code.

## The calibration chart (rubric v1)

**Three authored dimensions, one derived score.** Reach, impact and confidence
are the only authored values; score and tier follow mechanically.

**Reach** — share of users who hit the feature in a typical month:

| Reach | Reads as |
|---|---|
| 1 | under 5% — a narrow subset of users |
| 2 | 5–20% — a recognisable minority |
| 3 | 20–50% — a substantial share |
| 4 | 50–80% — most users |
| 5 | over 80% — effectively everyone |

**Impact** — how much the outcome changes for a user it does reach:

| Impact | Reads as |
|---|---|
| 1 | minor convenience; trivially done by hand |
| 2 | saves minutes of manual work |
| 3 | saves real time or avoids a common mistake |
| 4 | removes a manual workflow or prevents a class of bugs |
| 5 | a reason someone installs the extension |

**Confidence** — evidence quality behind the reach and impact figures:

| Confidence | Reads as |
|---|---|
| 1.0 | grounded in the extension's stated purpose and documented behaviour |
| 0.8 | reasoned from the JSON Schema domain and comparable tooling |
| 0.5 | speculative — no comparable to reason from |

**Bounded adjustment.** `reach × impact × confidence` gives a raw 0.5–25. Each
net factor code below moves it one **±10% step**, with the net clamped to
**±2 steps** (±20%) so the codes can colour a score but never invent one — an
adjusted score therefore spans 0.4–30, and a feature at the raw ceiling can
exceed 25:

| Code | Direction | Meaning |
|---|---|---|
| `ZEROCONF` | +1 step | delivers value with no configuration or user action |
| `UNIQUE` | +1 step | no built-in VS Code or common-extension equivalent |
| `GATEWAY` | +1 step | unlocks or is a precondition for other features' value |
| `CI` | +1 step | also delivers value outside the editor (CI/automation) |
| `DEP` | −1 step | needs an external dependency or setup for full value |
| `OVERLAP` | −1 step | substantially available from built-ins or common tools |
| `NARROW` | −1 step | applies only within a narrow workflow |

**Tiers** derive from the adjusted score:

| Score | Tier |
|---|---|
| ≥ 20 | Critical |
| 12–19.9 | High |
| 6–11.9 | Moderate |
| 2.5–5.9 | Niche |
| < 2.5 | Marginal |

**RICE** is `score ÷ effort points` (S13). It is computed at report and render
time, never stored — storing it would drift the moment an effort estimate
changed. Note that for already-built features the divisor is retrospective, so
RICE here is a *relative sizing aid for future work*, not a verdict on what has
already shipped.

## Functional Requirements

- **S16-SR-01** Every feature spec MUST have a value estimate in
  `specs/value.json` with reach (1–5), impact (1–5) and confidence
  (1.0 / 0.8 / 0.5) as the authored values, and its score and tier **derived**
  from the calibration chart above — the derived fields MUST NOT be authorable
  independently of the dimensions they come from.
- **S16-SR-02** Each estimate MUST record its reasoning and provenance: any
  adjustment factor codes from the enumerated set, a one-line justification,
  the estimator, the estimation date, and the rubric version.
- **S16-SR-03** A validator (`npm run check:spec-value`, wired into
  `npm run verify`) MUST fail on: a feature spec without an estimate, a
  dimension off its enumerated scale, a derived score or tier that contradicts
  the chart, an unknown factor code, a missing justification, or missing
  provenance. It MUST warn (not fail) when factor codes exceed the clamp, when
  an estimate rests on 0.5 confidence, and when a scored feature has no effort
  estimate to divide by.
- **S16-SR-04** The calibration constants (reach, impact and confidence
  scales, factor codes, step weight and clamp, tier bands) MUST be declared
  once in the validator script and mirrored by the chart in this spec; the
  validator is the machine-readable authority.
- **S16-SR-05** RICE MUST be derived from `specs/effort.json` at report and
  render time and MUST NOT be stored in `specs/value.json`, so effort keeps a
  single source of truth.
- **S16-SR-06** Value estimates MUST cover **feature** specs (`F##`) only;
  system specs describe quality attributes rather than customer-facing
  features, and scoring them would invite a category error.
- **S16-SR-07** Each feature spec's docs-site page MUST show its estimate —
  score, tier, dimensions, factors and justification — visibly labelled as an
  **advisory estimate** with its estimator and date, linking to this spec's
  page for the rubric.

## Non-Functional Requirements

- **S16-NFR-01** Value estimates MUST NOT influence the maturity score in any
  way: `scripts/maturity-score.mjs` MUST NOT read `specs/value.json`, and no
  maturity check may be derived from it. A judgement about worth is not an
  observable fact, and mixing it in would break the score's "observable facts
  only" guarantee.
- **S16-NFR-02** The validator MUST be plain Node with no third-party
  dependencies, like the repository's other checkers, and `value.json` MUST
  remain tool-neutral JSON any agent or human can edit.
- **S16-NFR-03** The rubric MUST NOT require telemetry, analytics, or any
  collection of user data to apply — it stays compatible with the project's
  zero-telemetry guarantee (S05), and the cost of that is carried openly by
  the confidence multiplier.

## Out of Scope

- Treating the score as a roadmap commitment or a promise to build anything.
- Per-requirement scoring — the feature spec is the estimation unit.
- Deriving value from download counts, reviews, or issue volume; those are
  external signals this repository does not own and cannot validate offline.
- Any time-series of value scores (the maturity score already owns trend
  reporting, and value moves too rarely to trend usefully).

## Acceptance Criteria

1. `specs/value.json` contains an estimate for every `specs/F*.md` file, and
   `npm run check:spec-value` passes.
2. Hand-editing a `score` to contradict its dimensions fails the validator;
   so does an unknown factor code, an off-scale reach, or a wrong tier.
3. `node scripts/spec-value.mjs --report` prints the features ranked by score
   and by RICE, with the RICE divisor read from `specs/effort.json`.
4. A feature spec page on the docs site shows its value estimate labelled
   "advisory", with dimensions, factors and justification, linking to this
   spec.
5. `scripts/maturity-score.mjs` contains no reference to `value.json`, and
   `npm run maturity` output is byte-identical whether or not
   `specs/value.json` exists.
