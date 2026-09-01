# json-schema-preview — agent guide

> **`AGENTS.md` is the single source of truth for AI coding agents on this
> project.** Claude Code doesn't read `AGENTS.md` natively, so `CLAUDE.md`
> imports it (`@AGENTS.md`); any other tool's instructions file should point
> here rather than copy it. This file is deliberately a **map, not a mirror**:
> it tells you where each piece of truth lives and records only the gotchas
> that live nowhere else. When a detail here could drift from the file it
> describes, the file wins — fix the pointer, don't fork the fact.

## Commands

- **Setup (fresh container)**: `node scripts/bootstrap.mjs` — **not** `npm ci`
  (the `canvas` dependency, demo-GIF pipeline only, compiles native code and
  fails in minimal containers; bootstrap installs with `--ignore-scripts`).
  Regenerating GIFs (`npm run make-gifs`) does need a full `npm install`.
- **Full local gate**: `npm run verify` (lint, workflow-lint, type-check,
  traceability, doc-traceability, consistency, spec-effort, spec-value,
  dependency audit, coverage — `scripts/verify.mjs`). Steps run concurrently
  and, by default, all run to completion with one summary at the end
  regardless of which step(s) failed; pass `npm run verify -- --fail-fast`
  (or `npm run verify:fail-fast`) to cancel the rest on the first failure
  instead. This is the single gate: the `.husky/pre-commit` hook runs it, and
  CI reaches the same checks (including the audit, via `npm run check:audit`).
- Everything else is in `package.json` `scripts` — notable entries:
  `compile`, `test:coverage`, `lint`, `lint:workflows`, `check:traceability`,
  `test:mutation`, `knip`, `schema:compat`, `test:integration`, `maturity`.
- **Run one test file**: `npx tsc -p tsconfig.test.json && npx mocha --ui tdd
  --require ./out/test/mocks/setup.js out/test/unit/<name>.test.js`.

## Where truth lives

| Topic | Authority |
|-------|-----------|
| Requirements (RFC-2119) & workflow | `specs/` — index and how-to in `specs/README.md` |
| Requirement ↔ code ↔ test matrix | `specs/traceability.json` (checked by `npm run check:traceability`) |
| Documentation ↔ spec tags | `specs/S07-documentation-traceability.md` (checked by `npm run check:doc-traceability`) |
| CI jobs, blocking vs non-blocking, path scoping | `.github/workflows/ci.yml` (scoping spec: `specs/S09-ci-workflow-scoping.md`) <!-- spec:S09 --> |
| Coverage & mutation exclusions | `package.json` (`c8.exclude`) and `stryker.config.json` — kept in lockstep by `npm run check:consistency` |
| Bundle-size budgets | `specs/S03-performance.md` + `scripts/check-bundle-size.mjs` (snapshot: `bundle-size.json`) |
| Integration/E2E testing | `specs/S08-e2e-testing.md` <!-- spec:S08 --> |
| Maturity scoring | `MATURITY.md` (scores computed by `scripts/maturity-score.mjs` — never hand-edit) |
| Spec effort estimates (advisory, never in the maturity score) | `specs/effort.json` (rubric: `specs/S13-spec-effort-estimation.md`, validated by `npm run check:spec-effort`) <!-- spec:S13 --> |
| Feature customer-value estimates (advisory, never in the maturity score) | `specs/value.json` (rubric: `specs/S16-feature-value-estimation.md`, validated by `npm run check:spec-value`; `npm run spec-value:report` ranks by value and RICE) <!-- spec:S16 --> |
| Project constitution | `.specify/memory/constitution.md` |

## Rules that gate your change

- **Spec-driven**: every code change must trace to a requirement in `specs/`
  (constitution Article IV). New/changed requirement → `npm run trace:init`,
  set its status in `specs/traceability.json`, tag covering tests with the
  `[ID]` in their titles. `npm run check:traceability` fails on drift and runs
  inside `npm run verify` (pre-commit + CI) for any agent or human.
- **Coverage**: all four c8 axes ≥ 80%. Exclusions are the entries in
  `package.json`'s `c8.exclude` (webview-HTML or subprocess-bound files only —
  touching the `vscode` API is *not* a reason to exclude; the shared mock in
  `src/test/mocks/` covers it). Requirements implemented only by excluded
  files are `manual` in the matrix, not `implemented`.
- **Commits**: Conventional Commits, enforced by `.husky/commit-msg`
  (commitlint) so release-please can derive the changelog.
- **Guarantees live below the agent**: anything that must hold is enforced in
  CI or a git hook. Agent hooks (`.claude/hooks/`) are in-session convenience
  only and are never the sole enforcement of a rule.
- **No bash/Python in the mandatory local gate** (`specs/S15-cross-platform-tooling.md`):
  every script `npm run verify` or the bootstrap step runs MUST be Node
  (`.mjs`) — no shell or Python assumed beyond Node + git, so a bare Windows
  checkout works. CI-only scripts that never run on a contributor's machine
  (e.g. `scripts/ci-detect-source-changes.sh`) are exempt; a script crossing
  into the mandatory gate must be ported to Node first.

## Gotchas (knowledge that lives only here)

- **Mocha uses the `tdd` interface**: `suite()`/`test()` with
  `setup()`/`teardown()`. The BDD names (`describe`, `beforeEach`, …)
  silently no-op.
- **`vscode` is a mock** in unit tests, injected via `src/test/mocks/setup.ts`
  (`Module._load` interception). Config reads go through
  `setConfig(section, key, value)` / `resetAll()` from
  `src/test/mocks/vscode.ts` — call `resetAll()` in `setup()`.
- Extension entry point: `src/extension.ts`. Docs site: VitePress under
  `docs/` (deployed by `.github/workflows/docs.yml`).
- **`lint:workflows` needs `actionlint` on PATH, Go, or Docker** (tries each in
  that order — `scripts/lint-workflows.mjs`); it's part of `npm run verify`, so
  a machine with none of the three fails the local gate on that step alone.
- **Dependabot (`.github/dependabot.yml`) groups each ecosystem/directory's
  bumps into one PR per bi-weekly run** (native `groups: {..., patterns:
  ["*"]}`, one per `updates:` entry — npm at `/`, github-actions at `/`, and
  npm at `/docs`, the VitePress site's own lockfile). Each entry defines
  **two** groups, not one: a bare `groups:` entry defaults to
  `applies-to: version-updates` and covers only the scheduled bumps above —
  it does NOT cover `applies-to: security-updates`, the event-triggered PRs
  Dependabot opens the moment a GitHub Advisory matches an installed
  dependency, independent of the schedule (exactly the PR type this repo
  cares most about consolidating, since that's how the nanoid/postcss CVEs
  arrived). Adding a dependabot `updates:` entry without both groups
  silently reintroduces individual, ungrouped PRs for that entry's security
  fixes even though its scheduled bumps stay grouped — easy to miss since
  nothing fails, it just quietly stops bundling the one PR type that matters
  most. A scheduled routine used to consolidate PRs after the fact; it was
  removed once grouping made that unnecessary, so an ungrouped batch of
  individual PRs should no longer occur — if you see one anyway (e.g. left
  over from before grouping was added, or a new `updates:` entry missing the
  security-updates group), ask an agent to consolidate it: the pattern is
  the merged consolidation PRs (search closed PRs for `Superseded by #`).
  Grouping is per ecosystem/directory, not global, so a single bi-weekly run
  can still open up to three PRs (npm, github-actions, docs npm) — that's
  expected, not a config bug. The two things that actually bite: `npm run
  package && npm run check:bundle-size` is a required CI check but NOT part
  of `npm run verify`, so it must be run separately (a `@types/vscode` bump
  has broken it before — `vsce` requires `@types/vscode` ≤
  `engines.vscode`); and closing a superseded PR frees Dependabot's
  `open-pull-requests-limit` slots, which can make it open a queued bump
  within a minute — re-check for a refill.
- **`typescript`'s major-version bumps are ignored in `dependabot.yml`** (PR
  #220): `npm ci` fails outright on typescript 7.x because
  `@typescript-eslint/eslint-plugin`/`parser` peer on
  `typescript@">=4.8.4 <6.1.0"`. `.github/workflows/typescript-eslint-ts7-watch.yml`
  runs `npm run check:ts7-eslint-support` bi-weekly and opens a tracking
  issue the one time that peer range starts allowing TS 7 — nothing else
  watches for this, so don't remove the ignore rule without checking that
  issue (or rerunning the check) first.

## Agnosticity & standardization (project principle)

This project deliberately maximizes AI-tool *and* model **agnosticity** and
prefers open standards over any vendor's format: it must be possible to swap
the agent or the model without losing any guarantee or durable knowledge.
Concretely: durable knowledge lives in tool-neutral markdown (`specs/`, the
constitution); enforcement lives in CI and git hooks (they fire on the
commit, not the tool); agent hooks delegate to vendor-neutral commands
(`git hook run pre-commit`); the wire favours open standards (Conventional
Commits, SemVer, SLSA, OpenSSF Scorecard, SHA-pinned actions, MCP via
`.mcp.json`). When adding tooling, ask: **would this still work if the user
switched agents or models tomorrow?** If not, it's an accelerator — make sure
the real guarantee also lives in CI or a git hook.
