# Contributing

We love your input! We want to make contributing to this project as easy and transparent as possible.

## Summary of the contribution flow

```
    ┌───────────────────────┐
    │                       │
    │    Open an issue      │
    │  (a bug report or a   │
    │   feature request)    │
    │                       │
    └───────────────────────┘
               ⇩
    ┌───────────────────────┐
    │                       │
    │  Open a Pull Request  │
    │   (only after issue   │
    │     is approved)      │
    │                       │
    └───────────────────────┘
               ⇩
    ┌───────────────────────┐
    │                       │
    │   Your changes will   │
    │     be merged and     │
    │ published on the next │
    │        release        │
    │                       │
    └───────────────────────┘
```

## Code of Conduct

Please [read the full text](./CODE_OF_CONDUCT.md) so that you can understand what sort of behaviour is expected.

## Development

```bash
npm install        # install dependencies (also sets up git hooks via husky)
npm run compile    # single webpack build
npm run watch      # rebuild on change
```

Press `F5` in VS Code to launch the Extension Development Host.

### Quality gate

`npm run verify` is the single source of truth for the local gate — run it before
pushing. It chains lint, type-check, and tests with coverage, and the same gate
runs in CI.

| Command | What it does |
|---|---|
| `npm run verify` | Full gate: lint + type-check + tests + coverage |
| `npm run lint` | ESLint over `src/**/*.ts` |
| `npx tsc --noEmit` | TypeScript strict type-check |
| `npm test` | Unit tests (mocha + sinon; `vscode` is mocked, no VS Code download) |
| `npm run test:coverage` | Unit tests with c8 coverage (all four axes must stay **≥ 80 %**) |
| `npm run test:e2e` | Playwright end-to-end demos (also generate the docs GIFs) |
| `npm run test:mutation` | StrykerJS mutation testing (report in `reports/mutation/`) |
| `npm run knip` | Report unused files, exports, and dependencies |
| `npm run compile` | Production webpack bundle |

Coverage must not regress below 80 % on statements, branches, functions, and
lines. VS Code API-bound classes that can't be unit-tested are excluded — see
`c8.exclude` in `package.json`.

### Commit gate

A Husky `pre-commit` hook runs `npm run verify`, and a `commit-msg` hook enforces
Conventional Commits via commitlint. Bypass intentionally with
`git commit --no-verify`. The gate also runs in CI, so the hook is a convenience,
not the only guarantee.

### Docs site

The VitePress site lives in `docs/`:

```bash
npm run docs:install   # install the site's dependencies
npm run docs:dev       # local dev server with hot reload
npm run docs:build     # production build
```

### AI-assisted contributions

`AGENTS.md` is the source of truth for AI coding agents (Claude Code reads it via
`CLAUDE.md`, which imports it). The project deliberately favours tool- and
model-agnostic standards — see the "Agnosticity & standardization" section there.

## Conventional commits

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary).
Pull request titles must follow the specification.

- `fix:` — bug fix, triggers a PATCH release
- `feat:` — new feature, triggers a MINOR release
- `build:` / `ci:` — build system, dependencies, or CI; no release
- `test:` — tests only, no release
- `docs:` — documentation only, no release
- `chore:` / `refactor:` — housekeeping or refactoring, no release

Add `!` for a MAJOR release (e.g. `feat!:`).

## License

By contributing you agree that your submissions are under the same
[MIT License](./LICENSE.md) that covers the project.
