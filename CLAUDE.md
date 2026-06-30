# json-schema-preview — Claude context

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
  - the agent **`.claude/hooks/pre-commit-gate.sh`** (PreToolUse on `git commit`,
    which calls `git hook run pre-commit` — vendor-neutral, so the logic isn't
    duplicated per tool),
  - CI (`.github/workflows/ci.yml`).
- **`.husky/commit-msg`** runs commitlint (Conventional Commits) so release-please
  can derive the changelog. Bypass intentionally with `git commit --no-verify`.
- Mutation testing (`mutation.yml`) and OpenSSF Scorecard / CodeQL / SLSA
  attestation (`scorecard.yml`, `codeql.yml`, `release-vsix.yml`) run in CI.
  Knip runs as a **non-blocking** CI job while its backlog is triaged.

## Coverage rule
All four c8 axes (statements, branches, functions, lines) must stay **≥ 80 %**.
A PostToolUse hook runs `npm run test:coverage` automatically after every source
file edit. If coverage drops, fix it before finishing — unless the user explicitly
says to skip the check for this session.

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
