# Software Requirements — JSON Schema Preview

This directory contains the Software Requirements Specification (SRS) for the
**JSON Schema Preview** VS Code extension. Each file covers one feature or
system-quality area using RFC-2119 key words (MUST, SHOULD, MAY).

## Index

| File | Area |
|------|------|
| [F01-preview.md](F01-preview.md) | Schema Preview panel |
| [F02-live-update.md](F02-live-update.md) | Live (debounced) preview updates |
| [F03-validation.md](F03-validation.md) | JSON/YAML validation against a schema |
| [F04-binding.md](F04-binding.md) | Schema–file binding management |
| [F05-visual-editor.md](F05-visual-editor.md) | Visual form-based schema editor |
| [F06-inference.md](F06-inference.md) | Schema inference from data files |
| [F07-auth.md](F07-auth.md) | Remote schema authentication |
| [F08-schema-cache.md](F08-schema-cache.md) | Local schema cache |
| [F09-configuration.md](F09-configuration.md) | Preview configuration panel and file |
| [F10-inline-binding.md](F10-inline-binding.md) | Inline `$schema` binding |
| [F11-toml-support.md](F11-toml-support.md) | TOML data-file support |
| [F12-schema-catalog.md](F12-schema-catalog.md) | Schema catalog & registry binding (SchemaStore + private catalogs) |
| [F13-ref-navigation.md](F13-ref-navigation.md) | `$ref` go-to-definition and hover |
| [F14-schema-bundling.md](F14-schema-bundling.md) | Schema bundling / dereferencing |
| [F15-schema-diff.md](F15-schema-diff.md) | Schema diff & breaking-change detection |
| [F16-sample-data.md](F16-sample-data.md) | Sample data generation from a schema |
| [F17-schema-linting.md](F17-schema-linting.md) | Schema quality linting |
| [F18-code-generation.md](F18-code-generation.md) | Code generation (schema → TypeScript types) |
| [F19-toml-intellisense.md](F19-toml-intellisense.md) | TOML schema IntelliSense (completions & hover) |
| [F20-workspace-validation.md](F20-workspace-validation.md) | Workspace-wide validation report |
| [F21-validation-quickfix.md](F21-validation-quickfix.md) | Quick fixes for data-validation errors |
| [F22-draft-migration.md](F22-draft-migration.md) | Schema draft migration (07 ↔ 2019-09 ↔ 2020-12) |
| [F23-schema-coverage.md](F23-schema-coverage.md) | Schema coverage — unused-in-data report |
| [F24-ref-graph.md](F24-ref-graph.md) | `$ref` dependency graph view |
| [F25-enum-nearest.md](F25-enum-nearest.md) | Enum quick-fixes ranked by nearest match |
| [F26-compat-gate.md](F26-compat-gate.md) | Backward-compatibility verdict & CI gate for schema diff |
| [F27-cli.md](F27-cli.md) | Standalone command-line interface (validate/lint/diff/bundle/migrate) |
| [S01-security.md](S01-security.md) | Webview security (CSP, nonces, sanitisation) |
| [S02-workspace-trust.md](S02-workspace-trust.md) | Workspace Trust integration |
| [S03-performance.md](S03-performance.md) | Performance and resource management |
| [S04-reliability.md](S04-reliability.md) | Reliability and offline behaviour (stale-cache fallback) |
| [S05-privacy.md](S05-privacy.md) | Privacy and data collection (zero telemetry) |
| [S06-accessibility.md](S06-accessibility.md) | Accessibility (keyboard, screen-reader, contrast) |
| [S07-documentation-traceability.md](S07-documentation-traceability.md) | Documentation ↔ spec traceability (`spec:` tags) |
| [S08-e2e-testing.md](S08-e2e-testing.md) | End-to-end testing in a real VS Code instance |
| [S09-ci-workflow-scoping.md](S09-ci-workflow-scoping.md) | Path-scoped CI jobs (`ci.yml`, `codeql.yml`) |
| [S10-spec-visualization.md](S10-spec-visualization.md) | Spec visualization on the docs site (matrix, spec pages) |
| [S11-traceability-schema.md](S11-traceability-schema.md) | Traceability matrix JSON Schema & generated TypeScript types |
| [S12-maturity-visualization.md](S12-maturity-visualization.md) | Maturity scorecard visualization & score history on the docs site |
| [S13-spec-effort-estimation.md](S13-spec-effort-estimation.md) | Advisory per-spec effort estimates (points / T-shirt / hours) |
| [S14-delivery-performance.md](S14-delivery-performance.md) | DORA delivery-performance metrics from git/release history |
| [S15-cross-platform-tooling.md](S15-cross-platform-tooling.md) | OS-agnostic development tooling & deployment (Windows/macOS/Linux, no bash/Python assumed) |
| [S16-feature-value-estimation.md](S16-feature-value-estimation.md) | Advisory per-feature customer-value estimates (RICE: reach/impact/confidence ÷ effort) |
| [S17-concurrent-verify-gate.md](S17-concurrent-verify-gate.md) | Concurrent local verify gate (`npm run verify`): parallel steps, full-summary reporting, `--fail-fast` option, dependency audit |
| [S18-mutation-score.md](S18-mutation-score.md) | Publishing the mutation score as a committed per-file artifact, so test strength can be compared where line coverage (gated at 80%, so flat) cannot |

## Scope

The extension targets VS Code **≥ 1.96.0** on desktop (not virtual workspaces).
The richest preview output uses **Python 3** on the user's PATH with
`json-schema-for-humans` installed, but Python is **optional**: without it (or
with `jsonschema.preview.renderer: "builtin"`) the dependency-free built-in
renderer is used instead (F01-FR-21/22), and every non-preview feature —
validation, binding, inference, linting, diff, codegen — is Python-free.

`package.json`'s `engines.vscode` and `@types/vscode` are pinned to this exact
floor for backward compatibility — don't bump either casually (e.g. as a side
effect of an unrelated `@types/vscode` dependency update). Raising this floor
is a deliberate compatibility-policy decision: update this line first, then
`package.json` to match, and re-verify `tsc --noEmit` still compiles cleanly
against the older `@types/vscode` surface.

## Key Words

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in these
documents are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Traceability

Every requirement has a stable ID (e.g. `F10-FR-04`, `S01-SR-02`) defined in
**bold** at its definition site. These IDs are the anchor for traceability:

1. **Matrix** — [`traceability.json`](traceability.json) maps every requirement
   ID to a `status` and a list of implementing source files (`impl`). It is the
   single machine-readable record of what is built, planned, or deferred.

   | status | meaning |
   |--------|---------|
   | `untracked` | predates the traceability system — needs backfill |
   | `planned` | specified, not yet implemented |
   | `implemented` | code exists; expects unit-test coverage |
   | `manual` | VS Code API-bound; verified by manual / E2E testing only |
   | `deferred` | explicitly out of scope / future work |

2. **Test tags** — unit and E2E tests reference the requirement they cover by
   putting its ID in square brackets in the test (or suite) title:

   ```ts
   test('[F10-FR-04] inserts $schema as the first key in the root object', () => { … });
   ```

   Test coverage is **auto-discovered** from these tags — the matrix never lists
   test names, so there is nothing to keep in sync by hand.

3. **Checker** — `npm run check:traceability` cross-checks all three sources and
   fails (exit 1) on real drift:
   - a requirement defined in a spec with no matrix entry;
   - a matrix entry whose requirement no longer exists (orphan);
   - a `[ID]` test tag that matches no requirement (stale / typo);
   - an `impl` path that does not exist on disk.

   It warns (without failing) when an `implemented` requirement has no test tag,
   when an `implemented`/`manual` entry lists no `impl` file, or when a `planned`
   requirement already has a test (a hint to promote it).

   Run `npm run trace:init` after adding new requirements to scaffold their
   matrix entries (added as `untracked`); then set the correct status.

### Workflow when implementing a requirement

1. Set its `status` in `traceability.json` (`planned` → `implemented`/`manual`)
   and fill in the `impl` file path(s).
2. Tag the covering test(s) with `[ID]`.
3. Run `npm run check:traceability` — it should stay green.
4. Cite the requirement ID(s) in the pull request (the PR template prompts for
   this). A change with no requirement ID should be docs-only, a dependency
   bump, or CI/tooling — say so instead.
