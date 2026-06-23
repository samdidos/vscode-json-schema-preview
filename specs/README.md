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
