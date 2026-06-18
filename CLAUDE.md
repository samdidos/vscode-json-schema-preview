# json-schema-preview — Claude context

## Commands
- **Build**: `npm run compile`
- **Test + coverage**: `npm run test:coverage`
- **Lint**: `npm run lint`
- **Type-check**: `npx tsc --noEmit`
- **Package**: `npx @vscode/vsce package --no-dependencies`

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
