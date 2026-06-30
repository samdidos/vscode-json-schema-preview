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
| [S01-security.md](S01-security.md) | Webview security (CSP, nonces, sanitisation) |
| [S02-workspace-trust.md](S02-workspace-trust.md) | Workspace Trust integration |
| [S03-performance.md](S03-performance.md) | Performance and resource management |

## Scope

The extension targets VS Code **≥ 1.96.0** on desktop (not virtual workspaces).
It requires **Python 3** on the user's PATH with `json-schema-for-humans` installed.

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
