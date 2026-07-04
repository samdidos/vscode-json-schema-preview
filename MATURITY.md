# Project Maturity Scorecard

A tracked, dated record of how mature this project's engineering practice and
AI-agent integration are — so improvements (and regressions) are visible over
time instead of living only in chat history. Scores are out of 5, assessed
against general industry practice for a project of this size (a single-package
VS Code extension), not against enterprise-scale codebases.

**Current snapshot: 2026-07-04**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/public/maturity-scorecard-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/public/maturity-scorecard-light.svg">
  <img alt="Project Maturity Scorecard: Overall 4.5, Spec & process 5.0, AI-agent integration 4.7, Testing 4.5, Security / supply chain 4.5, CI/CD & release 4.5, Docs 4.0, Code quality 4.0 — each scored out of 5" src="docs/public/maturity-scorecard-light.svg">
</picture>

*Regenerate after editing the table below:* `npm run maturity:chart`
*(update the score data at the top of `scripts/generate-maturity-chart.mjs`
first — it is the source the chart renders from).*

| Dimension | Score | Notes |
|---|---|---|
| Spec & process | 5 / 5 | 212 RFC-2119 requirements, machine-checked traceability (spec ↔ matrix ↔ `[ID]` test tags) enforced in the git pre-commit hook and CI, a project constitution with a defined amendment process (Article IX), Spec Kit (`.specify/`) for spec/plan/task generation. |
| Testing | 4.5 / 5 | 362 unit tests (mocha + sinon + fast-check property tests), 16 E2E files that double as demo-GIF generation, mutation testing (Stryker) now gates its own workflow via a real `break` threshold, coverage 94.5%/90.8% (stmts/branches) — well above the 80% floor. Only 3 files remain excluded from coverage, all for a defensible reason (webview HTML/postMessage plumbing or subprocess), not just "touches `vscode`". |
| Security / supply chain | 4.5 / 5 | CodeQL, OpenSSF Scorecard, SLSA build provenance on the `.vsix`, SHA-pinned GitHub Actions, Dependabot, credentials only ever in `SecretStorage`, nonce-based CSP on every webview (specced in `S01-security.md`). |
| CI/CD & release | 4.5 / 5 | release-please + Conventional Commits, docs auto-deploy, automated GIF regeneration on release, knip now blocks merges (backlog cleared), mutation testing ratchets its own workflow instead of silently always passing. |
| Docs | 4 / 5 | VitePress guide site, strong README/CONTRIBUTING/CODEOWNERS, a PR template that prompts for the requirement ID(s) a change implements. Gap: guide coverage (4 pages) still trails the 11 specced features. |
| Code quality | 4 / 5 | Strict TypeScript, webpack bundle, knip (now blocking). Gap: ESLint warnings (mostly naming-convention/curly-brace style) are tolerated rather than fixed or explicitly disabled. |
| **AI-agent integration** | 4.7 / 5 | See the dedicated table below. |

**Overall: 4.5 / 5** (up from the 2026-07-04 morning baseline of 4.2 / 5 — see History).

## AI-agent integration detail

| Practice | State |
|---|---|
| Single source of truth for agent instructions | ✅ `AGENTS.md`, thin per-tool pointers only (`CLAUDE.md` imports it via `@AGENTS.md`) |
| Guarantees live below the agent, not inside one tool | ✅ every agent hook (`.claude/hooks/*.sh`) delegates to a vendor-neutral command (`git hook run pre-commit`, `npm run verify`) that also runs in CI |
| Spec-awareness injected into every prompt | ✅ `UserPromptSubmit` hook (`spec-context.sh`) reminds the agent to trace code changes to `specs/` before implementing |
| Cold-session bootstrap | ✅ `scripts/bootstrap.sh` (vendor-neutral) + a `SessionStart` hook that runs it once per environment and no-ops on warm sessions |
| Permission friction | ✅ `permissions.allow` pre-approves read-only git and the gate commands |
| Documented footguns | ✅ "Working in this repo" section in `AGENTS.md` (container/canvas gotcha, `tdd` interface, coverage-exclusion list, traceability workflow) |
| Machine-readable build state | ✅ `specs/traceability.json` — any agent can discover what's built/planned/manual without reading every spec file |
| Portable tool access (not vendor-locked) | ✅ `.mcp.json` (GitHub MCP server) — works for any MCP-capable agent, not just one harness |
| PR review surfaces the spec trace | ✅ PR template prompts for requirement ID(s) |
| Ratchets vs. accelerators | ✅ knip blocks merges; Stryker's `break` threshold gates its own workflow instead of `null` (always-pass) |
| Tracked maturity signal | ✅ this file |

Remaining gap: mutation testing's `break: 60` threshold was set from the
*existing* "low" bound in `stryker.config.json`, not from an actual measured
score (a full run is expensive — see History, 2026-07-04). The first
scheduled/dispatched run of `.github/workflows/mutation.yml` after this change
should be checked to confirm 60 is realistic; adjust if it's a false alarm.

## History

- **2026-07-04 (morning)** — Baseline assessment: 4.2/5 engineering, 4/5
  AI-integration. Identified as gaps: no spec-checking prompt hook, no NFR
  coverage for reliability/privacy/performance budgets, no session bootstrap,
  no permission allowlist, undocumented footguns, `break: null` mutation
  testing, non-blocking knip, no PR template, no portable MCP config, 8 files
  excluded from coverage for being "VS Code-adjacent" without checking whether
  that was still true.
- **2026-07-04 (midday)** — Added the `UserPromptSubmit` spec-gate hook;
  `S03-performance.md` got concrete timeout/latency budgets; new
  `S04-reliability.md` (stale-cache fallback) and `S05-privacy.md`
  (zero telemetry) specs; `npm run verify` now runs `check:traceability`.
- **2026-07-04 (afternoon)** — Implemented the 3 features those specs
  described (configurable timeouts, offline stale-cache fallback, a pure-JS
  fallback renderer for when Python is unavailable); added `S06-accessibility.md`;
  re-synced the constitution's Article IV spec table (it had drifted — missing
  F10, F11). Backfilled all 150 previously-`untracked` requirements in
  `traceability.json` to `implemented` or `manual`.
- **2026-07-04 (evening)** — Session bootstrap script + `SessionStart` hook;
  permissions allowlist; footgun documentation in `AGENTS.md`.
- **2026-07-04 (night)** — knip CI job made blocking (backlog was already
  clear); Stryker `break` threshold wired to a real (if conservative) value;
  PR template requiring requirement IDs; `.mcp.json` for the GitHub MCP server;
  brought `SchemaCache`, `SchemaAuthManager`, `SchemaAuthCodeActionProvider`,
  `SchemaAuthStatusBar`, and `ValidationManager` into full unit-test coverage,
  cutting the coverage-exclusion list from 8 files to 3; this scorecard added.

## Maintaining this file

Update it when a change meaningfully moves a dimension — a new CI gate, a
material coverage change, a new spec area, a change to agent tooling. A
one-line dependency bump does not need an entry. Append to History rather than
rewriting it; only the snapshot table and overall score at the top should be
edited in place to reflect current state. When scores change, update the data
in `scripts/generate-maturity-chart.mjs` and run `npm run maturity:chart` so
the chart at the top of this file never drifts from the table.
