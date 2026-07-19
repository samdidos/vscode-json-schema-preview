<!-- spec:S12 start -->

# How the maturity score works

The [maturity scorecard](./) is a **modest, deliberately honest attempt** to
answer a hard question — *how mature is this project, really?* — as objectively
as a small repository can. It is not a badge to wave around and not a ranking
against other projects. It is a mirror the project holds up to itself.

## Why it exists

Most claims about a project's "maturity" live in someone's head, a chat
thread, or a README adjective ("production-ready", "battle-tested"). Those
don't survive scrutiny and they don't show a **trend** — you can't tell whether
last month's refactor made things better or worse.

The goal here is narrower and more defensible: turn maturity into a **computed
number derived from observable facts** in the repository — coverage
percentages, workflow configuration, the traceability matrix, file presence,
lint output — so that:

- **No score is hand-set.** Every point is earned by a fact a script can read.
  You can't argue the number up; you change the repository and the number
  follows.
- **Improvements and regressions are visible over time.** The
  [evolution chart](./#evolution-over-time) is the point — a single snapshot
  matters less than the direction.
- **The rubric is legible and contestable.** Every check states *what fact it
  reads* and *why it carries the weight it does*, on its
  [dimension page](./#scores-by-dimension). If a weight looks wrong, there's a
  specific line to argue about.

## How a score is computed

The whole calculation lives in one script,
[`scripts/maturity-score.mjs`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/scripts/maturity-score.mjs)
— the single source of truth. Everything on this site is rendered from the
committed
[`maturity-score.json`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/maturity-score.json)
it produces, so the docs can never disagree with the number.

The shape is intentionally simple:

1. **Checks.** Each check reads one observable fact and earns a fraction
   (0–1) of its point weight. A boolean fact (a file exists, a gate is set)
   earns all or nothing; a numeric fact (coverage vs a target, the ratio of
   SHA-pinned actions) earns a proportion.
2. **Dimensions.** Checks are grouped into seven dimensions (spec & process,
   testing, security/supply-chain, CI/CD & release, docs, code quality,
   AI-agent integration). A dimension's score is

   > **score = 5 × (points earned ÷ points possible)**

3. **Overall.** The headline number is the **mean of the dimension scores** —
   every dimension counts equally, so no single area can dominate.

Run `npm run maturity` to recompute it; a git pre-commit hook and CI flag drift
if the committed number falls out of date.

## Leaning on existing standards

Wherever a credible external standard already measures something, the rubric
**reads that signal directly** instead of inventing its own:

- **Supply chain:** presence of [CodeQL](https://codeql.github.com/), the
  [OpenSSF Scorecard](https://securityscorecards.dev/) workflow (and, when its
  cache is available, the live Scorecard grade folded in as
  `4 × grade/10`), [SLSA](https://slsa.dev/) build provenance, and the ratio
  of GitHub Actions pinned to a full commit SHA.
- **Testing:** the three [c8](https://github.com/bcoe/c8) coverage axes against
  a target, plus whether a [Stryker](https://stryker-mutator.io/) mutation gate
  exists.
- **Process & release:** [Conventional Commits](https://www.conventionalcommits.org/),
  automated releases, and the enforced verify gate.

Only where **no external standard fits** — most visibly *AI-agent integration*,
which is too new to have one — does the rubric fall back to an explicit,
documented presence checklist rather than a vibe. That distinction is on
purpose: borrow objectivity where it exists, and be transparent about where the
project had to define its own.

## Why the number is *not* reliable — and that's the point

Here is the honest caveat, stated plainly:

> **The rubric itself is evolving.** The checks, their weights, and their
> targets change as the project's understanding of "maturity" improves and as
> new standards emerge. A score of 4.5 today and 4.5 a year ago were produced
> by *different rulers*.

That has two consequences worth internalising:

- **It is not a cross-project certification.** You cannot compare this
  repository's number against another's and conclude anything — the rubric is
  self-relative, calibrated to *this* project's trend.
- **It is not an absolute truth even here.** It is a best-effort approximation
  that *tends toward* the most accurate measure the project can currently
  express, incorporating more of the existing standards over time. Treat a
  single decimal as a signal, not a verdict.

The value isn't precision — it's **direction, transparency, and accountability**.
Every check is inspectable, every weight is justified, every past number is
kept, and the whole thing is recomputed from facts on every change. That is
about as objective as project maturity gets, and the page is deliberately
upfront that "as objective as it gets" still isn't the same as "objective".

## Where the truth lives

- [`scripts/maturity-score.mjs`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/scripts/maturity-score.mjs)
  — the scorer: every check, weight, target, and justification.
- [`MATURITY.md`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/MATURITY.md)
  — the methodology narrative, known limitations, and the dated history of
  rubric changes.
- [`maturity-score.json`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/maturity-score.json)
  and [`maturity-history/`](https://github.com/samdidos/vscode-json-schema-preview/tree/main/maturity-history)
  — the current computed result and every past score change.

<!-- spec:S12 end -->
