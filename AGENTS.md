# json-schema-preview — agent guide

> **`AGENTS.md` is the single source of truth for AI coding agents on this
> project.** Claude Code doesn't read `AGENTS.md` natively, so `CLAUDE.md`
> imports it (`@AGENTS.md`); any other tool's instructions file (e.g. a Copilot
> `.github/copilot-instructions.md`) should point here rather than copy it. See
> **Agnosticity & standardization** below.

## Commands
- **Build**: `npm run compile`
- **Test + coverage**: `npm run test:coverage`
- **Lint**: `npm run lint`
- **Type-check**: `npx tsc --noEmit`
- **Full gate** (lint + type-check + traceability + coverage): `npm run verify`
- **Traceability check** (spec ↔ matrix ↔ test-tag drift): `npm run check:traceability`
- **Mutation testing**: `npm run test:mutation` (StrykerJS — report in `reports/mutation/`)
- **Dead code / unused deps**: `npm run knip`
- **Package**: `npx @vscode/vsce package --no-dependencies`

## Quality gates & hooks
- **`npm run verify`** is the single source of truth for the local gate. It is
  invoked from three places, all reaching it via the same path:
  - the Husky **`.husky/pre-commit`** hook (`npm run verify`),
  - the **Claude Code** agent hook (`.claude/hooks/pre-commit-gate.sh`, a
    PreToolUse hook on `git commit`) which calls `git hook run pre-commit` —
    a vendor-neutral git command, so the check logic isn't duplicated per tool.
    This is a *convenience* layer; CI and the git hook are the real guarantee.
  - CI (`.github/workflows/ci.yml`).
- **`.husky/commit-msg`** runs commitlint (Conventional Commits) so release-please
  can derive the changelog. Bypass intentionally with `git commit --no-verify`.
- **Spec-driven workflow**: every code change must trace to an RFC-2119
  requirement in `specs/` (workflow in `specs/README.md`). A **Claude Code**
  UserPromptSubmit hook (`.claude/hooks/spec-context.sh`) injects this
  workflow into each prompt — a *convenience* reminder; the enforced
  guarantee is `npm run check:traceability`, which runs inside
  `npm run verify` (git pre-commit hook + CI) and fails on spec/matrix/test
  drift regardless of which agent or human makes the change.
- Mutation testing (`mutation.yml`) and OpenSSF Scorecard / CodeQL run in CI
  (`scorecard.yml`, `codeql.yml`); SLSA build provenance for the `.vsix` is
  attested in the `release-please.yml` publish job. Knip runs as a
  **non-blocking** CI job while its backlog is triaged.

## Coverage rule
All four c8 axes (statements, branches, functions, lines) must stay **≥ 80 %**.
A **Claude Code** PostToolUse hook runs `npm run test:coverage` automatically
after every source file edit (a convenience accelerator — coverage is also
enforced in CI). If coverage drops, fix it before finishing — unless the user
explicitly says to skip the check for this session.

Files excluded from coverage (webview HTML generation or subprocess-bound —
`SchemaAuthManager`, `SchemaCache`, `SchemaAuthStatusBar`,
`SchemaAuthCodeActionProvider`, and `ValidationManager` were removed from this
list once tests proved the shared `vscode` mock covers their VS Code surface
too — see the 2026-07 traceability backfill):
`SchemaEditorPanel`, `ConfigWebPanel` (custom webview panels: HTML/postMessage
plumbing, not logic), `python.js` (shells out to a Python subprocess)

## Working in this repo (agents & humans)

Gotchas worth knowing before you touch anything — each one has cost someone a
debugging cycle:

- **Setup / fresh container.** Run **`bash scripts/bootstrap.sh`**, not
  `npm ci`. The `canvas` dependency (demo-GIF pipeline only) compiles native
  code with node-gyp and fails in minimal containers; bootstrap installs with
  `--ignore-scripts` and then wires up husky. A **Claude Code SessionStart
  hook** (`.claude/hooks/session-bootstrap.sh`) runs this automatically the
  first time a session starts in a cold environment — a convenience; the script
  is the real entry point. Regenerating GIFs (`npm run make-gifs`) does need a
  full `npm install` so canvas builds.
- **Run one test file:** `npx mocha --ui tdd --require ./out/test/mocks/setup.js
  out/test/unit/<name>.test.js` (after `tsc -p tsconfig.test.json`). `npm test`
  runs the whole suite with coverage.
- **Mocha uses the `tdd` interface.** Hooks are **`setup()` / `teardown()`**,
  not `beforeEach` / `afterEach`; tests are `suite()` / `test()`. Using the
  BDD names silently no-ops.
- **`vscode` is a mock**, injected via `src/test/mocks/setup.ts` (`Module._load`
  interception). Config reads work through `setConfig(section, key, value)` /
  `resetAll()` from `src/test/mocks/vscode.ts` — call `resetAll()` in `setup()`.
- **Traceability tags gate CI.** A `[Fxx-FR-yy]` tag in a `suite()`/`test()`
  title must reference a real requirement, and any `implemented` requirement
  should carry one. After adding requirements run `npm run trace:init`, then set
  each entry's status in `specs/traceability.json`.
- **Three files are excluded from coverage AND mutation** (see the Coverage
  rule below and `stryker.config.json`): `SchemaEditorPanel.ts`/`ConfigWebPanel.ts`
  (webview HTML/postMessage plumbing) and `python.ts` (subprocess). Being
  VS Code-*adjacent* is not itself a reason to exclude a file — five other
  classes that touch the `vscode` API (`SchemaAuthManager`, `SchemaCache`,
  `SchemaAuthStatusBar`, `SchemaAuthCodeActionProvider`, `ValidationManager`)
  are fully unit-tested via the `vscode` mock. Only exclude a new file if it's
  genuinely webview-HTML or subprocess-bound like these three; mark
  requirements the three remaining exclusions implement `manual` in the
  matrix, not `implemented`.

## Architecture notes
- Extension entry point: `src/extension.ts`
- Tests: plain Node.js + mocha + sinon, no VS Code download needed
- `vscode` is intercepted via `src/test/mocks/setup.ts` using `Module._load`
- Docs site: VitePress under `docs/` — built and deployed by `.github/workflows/docs.yml`

## Agnosticity & standardization (project principle)

**Decision.** This project deliberately maximizes AI-tool *and* model
**agnosticity**, and prefers open, widely-adopted **standards** over any single
vendor's format — as much as is practically possible. No agent, model, or
harness is privileged: it must be possible to swap Claude Code for Copilot,
Cursor, Codex, Aider, etc. — or to swap the underlying model — without losing
any guarantee or any durable knowledge.

Best practices that follow from this decision:

1. **`AGENTS.md` is the source of truth.** It is the cross-vendor convention, so
   it owns the content. Per-tool files are *thin pointers, never copies*:
   `CLAUDE.md` imports this file via `@AGENTS.md` (Claude Code doesn't read
   `AGENTS.md` natively); a Copilot `.github/copilot-instructions.md` (if ever
   added) should point here too. One file, no duplication.
2. **Durable knowledge lives in tool-neutral docs.** The project constitution
   (`.specify/memory/constitution.md`) and the RFC-2119 specs (`specs/`) are
   plain markdown any model can read. Spec Kit (`.specify/`) is multi-agent and
   regenerates per-tool command files, so don't hand-maintain those by hand.
   `MATURITY.md` tracks engineering and AI-integration maturity over time —
   update it (snapshot + a dated History entry) when a change meaningfully
   moves a dimension, e.g. a new CI gate or a material coverage change.
3. **Guarantees live *below* the agent.** Anything that must hold is enforced by
   CI (`.github/workflows/`) and git hooks (`.husky/`), which fire for any agent
   *or* human because they trigger on the commit/VCS, not on a specific tool.
   Agent hooks (Claude Code PreToolUse/PostToolUse, Cursor hooks, …) are a
   *convenience* — fast in-session feedback — and must **never** be the only
   place a rule is enforced, because they only run inside one tool.
4. **Reach shared logic through vendor-neutral commands.** The agent pre-commit
   hook delegates to `git hook run pre-commit` (native git), not an
   agent-specific re-implementation, so the check logic stays in exactly one
   place: `.husky/pre-commit` → `npm run verify`.
5. **Prefer standards on the wire, too.** Conventional Commits (commitlint +
   release-please), SemVer, SLSA build provenance, OpenSSF Scorecard, and
   SHA-pinned GitHub Actions are all open, portable, and independently
   verifiable — favour them over proprietary equivalents.
6. **Project-scoped tool access uses the open protocol, not a vendor API.**
   `.mcp.json` declares the GitHub MCP server (official `ghcr.io/github/github-mcp-server`
   image) so any MCP-capable agent — Claude Code, Cursor, VS Code Copilot,
   etc. — gets the same GitHub tool surface from one committed file, instead
   of each tool needing its own bespoke integration. Requires Docker and a
   `GITHUB_PERSONAL_ACCESS_TOKEN` in the environment; harnesses that already
   provide GitHub tools natively can ignore it.

When adding tooling or automation, ask: **would this still work if the user
switched agents or models tomorrow?** If a capability only works inside one
tool, treat it as an accelerator and make sure the actual guarantee also lives
in CI or a git hook.
