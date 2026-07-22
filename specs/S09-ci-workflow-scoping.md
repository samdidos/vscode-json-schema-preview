# S09 — CI Workflow Scoping

## Overview

`ci.yml`'s `build`/`security`/`knip`/`integration` jobs and `codeql.yml`'s
`analyze` job all exercise the TypeScript/JS build & test surface (lint,
`tsc`, webpack, coverage, Trivy, knip, the two-OS integration suite, CodeQL).
None of that can be broken by a docs-only or spec-only change, yet every PR —
including one that only edits `specs/traceability.json` or a `docs/**` page —
paid for all of it. Meanwhile the one check that *does* matter for exactly
that kind of PR, requirement/documentation traceability drift, ran nowhere in
CI at all — the opposite of what was needed.

This spec scopes the expensive jobs to diffs that could plausibly break them,
while keeping the cheap traceability checks unconditional so they still catch
drift on the PRs most likely to introduce it.

## Requirements

### Always-On Traceability

- **S09-SR-01** `check:traceability` and `check:doc-traceability` MUST run in
  CI (`ci.yml`) on every push and pull request, independent of which paths
  changed — these are the checks a docs/spec-only PR is most likely to need
  (S07-SR-08's guarantee extends to `check:traceability` too, not just the
  doc checker).

### Path-Scoped Jobs

- **S09-SR-02** `ci.yml`'s `build` (lint, type-check, compile, coverage,
  maturity check, dependency audit), `security` (Trivy), `knip`, and
  `integration` jobs, and `codeql.yml`'s `analyze` job, MUST be skipped when
  the triggering diff touches none of: `src/**`, `scripts/**`,
  `package.json`, `package-lock.json`, `webpack.config.js`,
  `tsconfig*.json`, `eslint.config.js`, `knip.json`, `stryker.config.json`,
  `commitlint.config.js`, `playwright.e2e.config.ts`, or
  `.github/workflows/**`. A diff with no resolvable base commit (new branch,
  history rewrite — `before` is unset or absent from history) MUST default to
  running everything rather than skipping.
- **S09-SR-03** The skip in SR-02 MUST be implemented as a job-level `if:`
  condition fed by a shared `changes` job's output, not as a workflow-level
  `on.push.paths` / `on.pull_request.paths` (or `paths-ignore`) trigger.
  Rationale: a path-filtered *trigger* never starts the workflow at all on a
  non-matching diff, and if that workflow's job is configured as a required
  status check in branch protection, GitHub shows it as permanently pending
  ("Expected — Waiting") instead of passing — it blocks merges rather than
  skipping cleanly. A job skipped via `if:` still reports a (skipped, passing)
  conclusion for that job, so required-status-check semantics hold regardless
  of branch-protection configuration.
- **S09-SR-04** `codeql.yml`'s weekly `schedule` run MUST always perform a
  full analysis regardless of SR-02's path filter — a scheduled run has no PR
  diff to gate against, and periodic full scans are the point of the
  schedule trigger.
- **S09-SR-05** The workflow files themselves MUST be statically checked in
  CI with [`actionlint`](https://github.com/rhysd/actionlint) — the workflow
  YAML is code (shell scripts, expressions, action references) and deserves a
  linter like the rest of the source. The check MUST run on every push and
  pull request, and MUST NOT add an unpinned action reference (use a
  version-pinned container image, which is exempt from the SHA-pin rule the
  security metric enforces).
- **S09-SR-06** The same actionlint check MUST also be runnable locally
  (`npm run lint:workflows`) and MUST be part of `npm run verify`, so the
  Husky pre-commit hook catches a broken workflow before it reaches CI —
  `AGENTS.md`'s "Full local gate ... CI reaches the same checks" claim MUST
  hold for this check too, not only for lint/`tsc`/tests. The local script
  and CI's container image MUST pin the identical actionlint version; a
  consistency check (`npm run check:consistency`) MUST fail if they drift.

## Non-Functional Requirements

- **S09-NFR-01** The diff detection in SR-02 MUST use only `git`/shell
  commands already available on GitHub-hosted runners (no third-party
  path-filtering action), consistent with this project's preference for
  standards over added vendor tooling (`AGENTS.md`, "Agnosticity &
  standardization").
- **S09-NFR-02** The path set and diff logic MUST be defined exactly once, in
  `scripts/ci-detect-source-changes.sh`, and referenced identically by every
  `changes` job (`ci.yml`, `codeql.yml`) rather than duplicated inline in
  workflow YAML — a second workflow needing the same scoping calls the same
  script instead of copying the pattern.

## Out of Scope

- Path-scoping workflows other than `ci.yml` and `codeql.yml`
  (`docs.yml`, `mutation.yml`, `scorecard.yml`, `snyk.yml`,
  `maturity-refresh.yml`, `refresh-gifs.yml`) — these already trigger on
  their own schedule/`workflow_dispatch`/`workflow_run` conditions, not on
  every PR, so they don't have the cost problem this spec addresses.
- Promoting `integration` to a required check (tracked separately in
  `S08-SR-08`).

## Acceptance Criteria

1. A PR touching only `docs/**`, `specs/**`, or root `*.md` files shows the
   `traceability` job passing and `build`/`security`/`knip`/`integration`
   (and CodeQL's `analyze`) reporting as skipped, not pending.
2. A PR touching `src/**` runs every job as before this spec.
3. A PR that only edits `specs/traceability.json` still runs
   `check:traceability` and `check:doc-traceability`.
4. The Monday 03:27 UTC `codeql.yml` schedule run always performs a full
   analysis.
5. `ci.yml` and `codeql.yml` each invoke `scripts/ci-detect-source-changes.sh`
   rather than defining the path pattern inline; changing the pattern is a
   one-file edit.

## Relation to Existing Specs

- Closes the enforcement gap the investigation behind this spec found:
  `check:doc-traceability`'s CI guarantee (S07-SR-08) is extended here to
  `check:traceability` as well, and both are made structurally unconditional
  rather than steps inside a job that could later be scoped away.
- Complements **S08**'s CI-integration requirements (`S08-SR-08/09`) for the
  `integration` job specifically; this spec governs when that job (and the
  other `ci.yml`/`codeql.yml` jobs) run at all.
- This is a CI/tooling change; per `specs/README.md`'s traceability workflow
  such changes don't strictly require a spec entry ("say so instead"), but
  it's specified here anyway since the design (job-level `if:` vs.
  workflow-level path triggers) has a real correctness trade-off worth
  recording, not just a mechanical config tweak.

## History

- 2026-07-22 — Added S09-SR-06: actionlint must also run locally via
  `npm run verify`, not only in CI, closing a local/CI parity gap (the
  Husky pre-commit hook ran `npm run verify`, which did not include the
  workflow-lint check CI already enforced).
