# Project Constitution — json-schema-preview
<!-- CONSTITUTION_VERSION: 1.0.0 | RATIFICATION_DATE: 2026-06-24 | LAST_AMENDED_DATE: 2026-06-24 -->

## Article I — Identity

This is **json-schema-preview**, a VS Code extension that renders human-readable
HTML documentation from JSON Schema files using `json-schema-for-humans` and
provides schema-aware tooling (validation, visual editing, binding, inference,
remote auth, and local caching).

Extension entry point: `src/extension.ts`
Minimum VS Code version: `1.96.0`
Engine: Node.js, TypeScript (strict), CommonJS modules.

## Article II — Technology Constraints

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict mode) | Compile-time safety, VS Code API types |
| Runtime | Node.js (VS Code extension host) | Required by the platform |
| Schema renderer | `json-schema-for-humans` (Python, subprocess) | Produces the HTML output |
| Schema inference | `genson-js` | Pure JS, no subprocess needed |
| YAML parsing | `yaml` npm package | Handles YAML data files |
| HTML sanitisation | `sanitizeHtml` | XSS prevention in webviews |
| Unit tests | mocha + sinon | No VS Code download needed |
| E2E tests | Playwright (`@playwright/test`) | Screenshots and GIF assets |
| Coverage | c8 (all four axes ≥ 80 %) | Enforced by PostToolUse hook |

VS Code API-bound classes are excluded from coverage:
`SchemaAuthManager`, `SchemaCache`, `SchemaAuthStatusBar`,
`SchemaAuthCodeActionProvider`, `ValidationManager`, `SchemaEditorPanel`,
`ConfigWebPanel`, `python.js`.

## Article III — Architecture Principles

1. **Never block the extension host.** All Python subprocess calls and HTTP
   fetches MUST be asynchronous. Use `child_process` async APIs or `AbortSignal`-
   guarded `fetch`.
2. **Webview isolation.** Every webview MUST use a nonce-based Content Security
   Policy (see `S01-security.md`). No inline scripts without nonce.
3. **No sensitive data in webview HTML.** User credentials and tokens MUST NOT
   appear in rendered HTML. Use `embedJson` + `sanitizeHtml` for all dynamic
   content.
4. **Workspace Trust.** Live-update, preview, and Python invocations MUST be
   silently skipped in untrusted workspaces (see `S02-workspace-trust.md`).
5. **Resource cleanup.** Every webview panel MUST be tracked in
   `context.subscriptions` and disposed on deactivation. Debounce timers MUST
   be cleared when their panel closes.
6. **Logging.** All diagnostic output MUST go through the named
   `LogOutputChannel` ("JSON Schema Preview"). `console.log` / `console.error`
   are banned in production code.

## Article IV — Specification Baseline

All features are specified as RFC-2119 requirement documents in `specs/`:

| File | Feature |
|---|---|
| `F01-preview.md` | HTML preview panel |
| `F02-live-update.md` | Debounced live preview updates |
| `F03-validation.md` | JSON/YAML validation against schema |
| `F04-binding.md` | Schema–file binding (json.schemas / yaml.schemas) |
| `F05-visual-editor.md` | Visual form-based schema editor |
| `F06-inference.md` | Schema inference from data files (genson-js) |
| `F07-auth.md` | Remote schema authentication |
| `F08-schema-cache.md` | Local schema caching |
| `F09-configuration.md` | Extension configuration surface |
| `S01-security.md` | Nonce CSP, sanitisation, embedJson |
| `S02-workspace-trust.md` | Workspace trust gating |
| `S03-performance.md` | Subprocess timeout, cleanup, logging |

New features MUST have a corresponding spec file before implementation begins.

## Article V — Testing Standards

1. Unit tests live in `src/test/` and run without a VS Code download.
2. `vscode` is mocked via `src/test/mocks/setup.ts` using `Module._load`.
3. Every code path reachable without the extension host MUST have a test.
4. E2E tests live in `src/test/e2e/` and use Playwright's Electron API.
5. E2E tests capture PNG screenshots; `scripts/make-gifs.mjs` stitches GIF assets
   for `docs/public/`.
6. Coverage is enforced by a PostToolUse hook — do not edit source files without
   fixing coverage regressions first.

## Article VI — Commit and Release Standards

This project uses **Conventional Commits** with **release-please** for automated
changelog generation. Commit prefixes:

| Prefix | When |
|---|---|
| `feat:` | New user-visible capability |
| `fix:` | Bug fix |
| `build:` | Build system, scripts, GIF pipeline |
| `test:` | Tests only |
| `docs:` | Documentation, specs |
| `chore:` | Dependencies, tooling, config |
| `refactor:` | Internal restructuring (no behaviour change) |

Breaking changes append `!` (`feat!:`) and include a `BREAKING CHANGE:` footer.

## Article VII — Security Non-Negotiables

1. No `eval` or `innerHTML` without sanitization in webview code.
2. All outbound HTTP requests carry an explicit timeout.
3. Temporary files written for live-update MUST be deleted after use (success or
   failure).
4. Remote schema credentials MUST be stored in VS Code `SecretStorage`, never
   in plain settings.
5. `nonce` values MUST be cryptographically random (e.g., `crypto.randomBytes`),
   one per webview render.

## Article VIII — Documentation Standards

- User-facing docs live under `docs/` (VitePress), deployed via
  `.github/workflows/docs.yml`.
- Every new feature in a `feat:` commit MUST be documented in the relevant
  `docs/guide/*.md` page before the PR is merged.
- Animated GIF demos for the docs site are generated from E2E screenshots via
  `npm run make-gifs`.

## Article IX — Amendment Process

Amend this constitution by opening a PR that modifies this file and the
relevant `specs/` file(s) together. Run `/speckit.constitution` in Claude Code
to propagate changes to dependent templates.
