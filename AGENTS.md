# json-schema-preview — agent guide

> **`AGENTS.md` is the single source of truth for AI coding agents on this
> project.** `CLAUDE.md` is a symlink to this file, and any other tool's
> instructions file (e.g. a Copilot `.github/copilot-instructions.md`) should
> point here rather than copy it. See **Agnosticity & standardization** below.

## Commands
- **Build**: `npm run compile`
- **Test + coverage**: `npm run test:coverage`
- **Lint**: `npm run lint`
- **Type-check**: `npx tsc --noEmit`
- **Full gate** (lint + type-check + coverage): `npm run verify`
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

Files excluded from coverage (VS Code API-bound, can't be unit-tested without
the full extension host):
`SchemaAuthManager`, `SchemaCache`, `SchemaAuthStatusBar`,
`SchemaAuthCodeActionProvider`, `ValidationManager`, `SchemaEditorPanel`,
`ConfigWebPanel`, `python.js`

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
   `CLAUDE.md` is a symlink to this file; a Copilot
   `.github/copilot-instructions.md` (if ever added) should point here too.
   One file, no duplication.
2. **Durable knowledge lives in tool-neutral docs.** The project constitution
   (`.specify/memory/constitution.md`) and the RFC-2119 specs (`specs/`) are
   plain markdown any model can read. Spec Kit (`.specify/`) is multi-agent and
   regenerates per-tool command files, so don't hand-maintain those by hand.
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

When adding tooling or automation, ask: **would this still work if the user
switched agents or models tomorrow?** If a capability only works inside one
tool, treat it as an accelerator and make sure the actual guarantee also lives
in CI or a git hook.
