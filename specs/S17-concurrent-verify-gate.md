# S17 — Concurrent Verify Gate

## Overview

`npm run verify` is the project's single local quality gate (`AGENTS.md`):
the Husky pre-commit hook and CI both reach it, and it is supposed to be the
one place a contributor (human or agent) runs before trusting a change.
Today it is a chain of `&&`-joined `npm run` calls: `lint`, `lint:workflows`,
`tsc --noEmit`, `check:traceability`, `check:doc-traceability`,
`check:consistency`, `check:spec-effort`, `check:spec-value`, and
`test:coverage`. Two problems follow directly from that shape. First, `&&`
stops at the first failing step, so a run that fails on `lint` never tells
you whether `check:traceability` or the test suite would also have failed —
each fix-and-rerun cycle can only surface one new problem at a time. Second,
the steps run one after another even though most of them are independent
(reading different files, touching different output directories), so the
wall-clock cost is the *sum* of every step instead of the slowest one.

Separately, `ci.yml`'s `build` job already runs `npm audit --audit-level=high`
on every source-touching push/PR, but `npm run verify` does not — so
`AGENTS.md`'s "CI reaches the same checks" claim (and `S09`'s local/CI parity
principle for `lint:workflows`) has quietly not held for the dependency audit.

This spec makes `npm run verify` run its steps concurrently, report every
step's outcome in one summary regardless of individual failures (with an
opt-in `--fail-fast` for the "stop at the first problem" workflow some
contributors still want), and folds the dependency audit into that same run
so the local gate and CI enforce identical policy.

## Requirements

### Concurrent Execution

- **S17-SR-01** `npm run verify` MUST run its constituent checks concurrently
  rather than chained with `&&`, via a Node orchestrator script
  (`scripts/verify.mjs`) — consistent with `S15-SR-01`'s Node-and-git-only
  constraint on the mandatory local gate.
- **S17-SR-02** By default (no flags) the orchestrator MUST let every step run
  to completion regardless of any other step's failure, then print a summary
  covering **every** step — name, pass/fail, and duration — and exit non-zero
  if any step failed. A single run MUST surface every problem the full set of
  checks would find, not just the first one encountered.
- **S17-SR-03** The summary MUST include the full captured stdout/stderr of
  every **failed** step, so a failure is diagnosable from that one run's
  output without re-running the step in isolation.
- **S17-SR-04** An opt-in `--fail-fast` flag (`npm run verify -- --fail-fast`)
  MUST, on the first step failure, stop waiting for and cancel every
  not-yet-finished step, then print the summary (S17-SR-02/03) for whichever
  steps did complete, and exit non-zero.
- **S17-SR-05** The step list (name → `npm run` script) MUST be declared
  exactly once, in `scripts/verify.mjs`; `package.json`'s `verify` script MUST
  only invoke the orchestrator, not re-list the steps itself.

### Dependency Audit

- **S17-SR-06** A dependency-vulnerability audit MUST be one of the
  concurrent steps, wired as `npm run check:audit` running
  `npm audit --audit-level=high` — the identical command and severity
  threshold `ci.yml`'s `build` job already enforces. Both MUST invoke this one
  script rather than each defining their own `npm audit` invocation, so the
  audit policy cannot drift between local and CI the way it could if the
  level were duplicated in two places.

## Non-Functional Requirements

- **S17-NFR-01** The orchestrator MUST be plain Node with no new runtime
  dependency, and MUST behave identically on Windows, macOS, and Linux:
  spawning each step's process directly (resolving the platform's `npm`
  executable) rather than assuming a POSIX shell, per `S15-SR-01`.
- **S17-NFR-02** Running steps concurrently MUST NOT change any individual
  step's own pass/fail semantics or output — each step is still exactly
  `npm run <script>`, unmodified, so a step's behavior when run alone (e.g.
  `npm run lint`) is identical to its behavior inside `npm run verify`.

## Out of Scope

- Parallelizing *within* a single step (e.g. sharding the test suite itself
  across workers) — this spec is about orchestrating the existing top-level
  steps, not changing what any one of them does internally.
- Any change to which steps `ci.yml` runs or how it scopes them by path — that
  is `S09`'s concern; this spec only affects the local `verify` orchestrator
  and the one `check:audit` script both now share.

## Acceptance Criteria

1. `npm run verify` on a checkout where both `lint` and `check:traceability`
   are broken reports both failures in its final summary from a single run.
2. `npm run verify -- --fail-fast` on the same checkout stops launching/
   cancels remaining steps after the first failure and exits non-zero.
3. `npm run check:audit` runs `npm audit --audit-level=high` and is included
   in the default `npm run verify` run; `ci.yml`'s `build` job invokes the
   same script rather than its own `npm audit` line.
4. Total wall-clock time of `npm run verify` on an otherwise-passing checkout
   is meaningfully less than the sum of its individual steps' times run one
   at a time.
5. `npm run verify` still exits 0 when, and only when, every step exits 0.

## Relation to Existing Specs

- Complements `S09` (CI job scoping): that spec governs which `ci.yml` jobs
  run at all; this one governs how the local `verify` gate — the thing
  `S09-SR-06` requires to have parity with CI — executes and reports.
- Builds on `S15-SR-01`'s Node-and-git-only constraint for the mandatory
  local gate; the orchestrator is itself a script that constraint governs.

## History

- 2026-07-25 — Initial spec, prompted by `npm run verify`'s `&&`-chain hiding
  later failures behind an earlier one, its wall-clock cost being additive
  across independent steps, and its missing dependency audit despite CI
  already enforcing one.
