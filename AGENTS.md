# json-schema-preview — agent guide

> **`AGENTS.md` is the single source of truth for AI coding agents on this
> project.** Claude Code doesn't read `AGENTS.md` natively, so `CLAUDE.md`
> imports it (`@AGENTS.md`); any other tool's instructions file should point
> here rather than copy it. This file is deliberately a **map, not a mirror**:
> it tells you where each piece of truth lives and records only the gotchas
> that live nowhere else. When a detail here could drift from the file it
> describes, the file wins — fix the pointer, don't fork the fact.

## Commands

- **Setup (fresh container)**: `bash scripts/bootstrap.sh` — **not** `npm ci`
  (the `canvas` dependency, demo-GIF pipeline only, compiles native code and
  fails in minimal containers; bootstrap installs with `--ignore-scripts`).
  Regenerating GIFs (`npm run make-gifs`) does need a full `npm install`.
- **Full local gate**: `npm run verify` (lint + type-check + traceability +
  doc-traceability + consistency + coverage). This is the single gate: the
  `.husky/pre-commit` hook runs it, and CI reaches the same checks.
- Everything else is in `package.json` `scripts` — notable entries:
  `compile`, `test:coverage`, `lint`, `check:traceability`, `test:mutation`,
  `knip`, `schema:compat`, `test:integration`, `maturity`.
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
