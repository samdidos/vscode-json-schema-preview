# S14 — Delivery Performance (DORA Metrics)

## Overview

The maturity scorecard (S12) measures **practices** — is the right machinery
installed and enforced. This spec adds the first **outcome** measure: the four
[DORA](https://dora.dev/guides/dora-metrics/) delivery-performance metrics —
deployment frequency, lead time for changes, change failure rate, and time to
restore service — computed **entirely from git tags and commit history**, so
they are as observable and backfillable as any other fact in this repository,
with no external service.

DORA (DevOps Research and Assessment) is the industry-standard research
program behind the *Accelerate* book and the annual *State of DevOps Report*;
its key finding is that throughput (frequency, lead time) and stability
(failure rate, restore time) improve *together* in healthy teams. This project
has no production servers, so **a published release is the unit of
deployment**: the release-please tag → Marketplace publish pipeline is the
"deploy", and every metric below is defined against release tags.

## Repository-context mapping

| DORA metric | This repository's observable proxy |
|---|---|
| Deployment frequency | cadence of `vX.Y.Z` release tags over time |
| Lead time for changes | time from a commit's authoring to the release tag that first ships it |
| Change failure rate | share of releases that required a subsequent **patch** release (a `fix:`-driven hotfix under release-please) |
| Time to restore service | elapsed time from a failure-causing release to the patch release that fixed it |

These are deliberately *proxies*, honestly labelled: a semver patch release
under Conventional Commits + release-please is `fix:`-driven, which makes it a
clean signal that the preceding release shipped a defect — but a patch can
also carry minor non-defect fixes, so the failure rate is an upper-ish bound,
not ground truth. The site states this next to the number.

## Functional Requirements

- **S14-SR-01** **Deployment frequency** MUST be computed from the sequence of
  release tags: the median number of days between consecutive releases, and a
  derived human phrasing (e.g. releases per week). It MUST also expose the
  per-release intervals so a trend is visible.
- **S14-SR-02** **Lead time for changes** MUST be computed per release as the
  median of (release-tag date − commit author date) over the commits first
  shipped in that release (the commits in `previousTag..thisTag`), and
  reported as the median across all such commits, in days. Per-release medians
  MUST be exposed for the trend.
- **S14-SR-03** **Change failure rate** MUST be the fraction of releases
  classified as failures, where a release is a **failure** when the next
  release is a semver **patch** bump (a hotfix). The classification MUST be
  derivable from the tag sequence alone (semver comparison), and each failing
  release MUST be identifiable.
- **S14-SR-04** **Time to restore service** MUST be computed for each failure
  as the elapsed time from the failing release to its fixing patch release,
  and reported as the median across failures. When there are no failures it is
  reported as not-applicable, never as zero.
- **S14-SR-05** Each metric MUST be classified into a DORA performance band
  (Elite / High / Medium / Low) using published reference thresholds declared
  once in the generator, **and** shown with the caveat that those thresholds
  target continuously-deployed services — a release-based extension is
  measured against them for reference, not as a target.
- **S14-SR-06** All metrics MUST be computed deterministically and offline
  from `git` tag and commit metadata plus Conventional Commit types; no
  network call and no external service. The result MUST be written to a
  committed `dora.json`, regenerable with `npm run dora`. Because the source
  is git history itself, regeneration reconstructs the full timeline — there
  is no separate backfill step and no hand-maintained history file.
- **S14-SR-08** `dora.json` MUST be refreshed **when a release happens**, not
  only on a periodic schedule. Every metric here is a pure function of the
  release-tag set — `perWeek` divides by the span between the first and last
  tag, never by wall-clock now — so the file goes stale at exactly one moment:
  a new tag. Refreshing it on an unrelated weekly clock while releases land at
  a median interval of ~1.3 days leaves the published Delivery view stale for
  most of its life; it sat three releases behind (ending at v0.13.0 while the
  extension shipped v0.16.0) when this requirement was written.
- **S14-SR-10** When generated on a branch that stages an as-yet-untagged
  release, `dora.json` MUST include that **pending release**. The refresh
  runs inside the release PR so the release ships with its own metrics
  (S14-SR-08), but release-please only creates the tag when that PR merges —
  so a tags-only computation would end one release short, and would be stale
  the instant the tag landed. A pending release is identified by
  `package.json`'s version having no matching `vX.Y.Z` tag **and** a
  `CHANGELOG.md` entry carrying that version's release date; both must hold,
  so a hand-edited version bump alone cannot invent a release. Its date comes
  from that changelog entry — the same date release-please stamps on the
  release — making the synthesised entry accurate to the day rather than to
  the minute of tagging. When the version is already tagged, nothing is
  synthesised and output is unchanged (S14-SR-06's determinism still holds).
- **S14-SR-09** `npm run dora:check` MUST distinguish **"no release tags are
  visible"** from **"`dora.json` is stale"**, and MUST say which. The two are
  indistinguishable by value — a checkout with no tags computes zero releases,
  which compares unequal to any committed timeline and so reports staleness —
  but they demand opposite responses: one is a broken checkout (the
  shallow-clone hazard S10-SR-15 records, since `actions/checkout` fetches no
  tags by default), the other is a missing refresh. A check that cannot see
  the data it validates MUST NOT claim the data is wrong.

- **S14-SR-07** The docs site MUST present a **Delivery** view rendering
  `dora.json`: the four metrics as labelled tiles with their bands and the
  repository-context caveat, plus a per-release trend (lead time and release
  interval) and a per-release table. It MUST link to `dora.dev` for the metric
  definitions.

## Non-Functional Requirements

- **S14-NFR-01** The DORA metrics MUST NOT be folded into the maturity score
  in this spec: `scripts/maturity-score.mjs` MUST NOT read `dora.json`. Unlike
  the effort estimates (S13, a judgement), these metrics *are* observable
  facts and would be *eligible* to become a maturity dimension later — but
  adding an eighth dimension re-weights the overall score, which is a
  deliberate rubric decision to make on its own, not a side effect of adding
  the measurement. Until then this is a standalone delivery dashboard.
- **S14-NFR-02** The generator MUST be plain Node with no third-party
  dependencies (like the repository's other `scripts/*.mjs`), and `dora.json`
  MUST remain tool-neutral JSON.

## Out of Scope

- MTTR for incidents not tied to a release (there is no incident tracker;
  S05's zero-telemetry stance means the issue tracker is the only ops signal,
  covered separately if issue-health is ever added).
- Promoting DORA to a maturity dimension (a future decision, per S14-NFR-01).
- The 2024 fifth metric (rework/reliability) — needs an operational reliability
  signal this project does not yet collect.

## Acceptance Criteria

1. `npm run dora` writes `dora.json` containing the four metrics, their bands,
   and a per-release breakdown, computed purely from git — running it twice
   with no new tags produces identical output.
2. Cutting a new release tag changes the metrics on the next `npm run dora`
   with no other edit.
3. The Delivery page renders the four tiles, the trend, and the per-release
   table, each labelled with the release-as-deploy caveat and linking to
   `dora.dev`.
4. `scripts/maturity-score.mjs` contains no reference to `dora.json`, and the
   maturity score is unaffected by this spec.
