# Security, Privacy & Accessibility

<!-- spec:S05 start -->

## Privacy: zero telemetry

**The extension collects and transmits nothing about your usage.** There is no
opt-in toggle, because the capability does not exist in the shipped code — no
analytics, no usage counters, no crash reports, to any endpoint, ever.

The only outbound requests it makes are ones you triggered:

| Request | When |
|---|---|
| Fetching a schema URL | You bound it, wrote it as an inline `$schema`, or ran a cache command |
| Fetching a schema catalog | You enabled SchemaStore or configured a private catalog |
| Fetching an external `$ref` | You ran Bundle, Generate Types, or accepted the `$ref` graph's per-invocation prompt |
| A language model request | You enabled AI assistance **and** ran an AI command — see [AI assistance](/guide/ai) |

Schema contents, workspace file paths and credentials are never sent to any host
other than the schema's own origin. Stored credentials are only ever attached to
requests to the host they were saved for.

<!-- spec:S05 end -->

<!-- spec:S01 start -->

## Webview security

Every panel this extension opens — the preview, the visual editor, the config
panel, the `$ref` graph — is a hardened webview:

- A **nonce-based Content Security Policy**: only scripts carrying the
  panel's freshly generated nonce execute, so injected markup cannot run.
- **HTML-escaped schema content**: schema text is escaped before it reaches the
  panel, so a `description` containing markup renders as text rather than DOM.
- **No remote code**: the default `flat` render template is chosen specifically
  so the preview pulls nothing from a CDN.
- The `$ref` graph panel is **script-free** entirely, under a locked-down CSP.

<!-- spec:S01 end -->

<!-- spec:F07 start -->

## Credentials

Credentials for private schemas are stored with VS Code's **Secret Storage
API**, which uses your operating system's keychain — never in settings, never in
a file in your workspace, never in the extension's own storage.

GitHub authentication reuses your existing VS Code GitHub session, so there is no
token to paste or rotate.

A credential is attached only to requests to the exact host it was saved for.

<!-- spec:F07 end -->

<!-- spec:S02 start -->

## Workspace Trust

The extension declares `untrustedWorkspaces: limited`. In an untrusted workspace
(VS Code's Restricted Mode) the features that run a local subprocess, write
files, or reach the network are disabled, and the rest keep working:

| Feature | Trusted | Untrusted |
|---|---|---|
| Preview / live update | ✅ | ❌ (warning, with a Manage Trust button) |
| Validation, binding, inference | ✅ | ✅ |
| Inline `$schema` binding (writes the file) | ✅ | ❌ |
| Bundle, Generate Types (read files + network) | ✅ | ❌ |
| Validate Workspace | ✅ | ✅ — remote schemas from the local cache only |

<!-- spec:S02 end -->

<!-- spec:S04 -->
## Reliability offline

If a remote schema can't be reached — offline, DNS failure, timeout, or a 5xx —
and a cached copy exists, that copy is used and a non-blocking warning says so.
A `404` is treated as authoritative (the schema moved or was deleted) and always
surfaces as an error, even with a stale cache on disk.

<!-- spec:S06 start -->

## Accessibility

- Every control the extension injects is **keyboard-operable** and
  **screen-reader-labelled**.
- **State is never colour-only**: severity, validity and status are always
  carried by text or an icon as well as colour.
- The preview panel supports VS Code's native find widget
  (<kbd>Ctrl</kbd>+<kbd>F</kbd>), and inherits your editor theme and font size.
- The `$ref` graph renders a text adjacency list beside the diagram, so it reads
  the same with or without the picture.
- Every feature is reachable from the Command Palette; nothing requires a mouse.

<!-- spec:S06 end -->

## Reporting a vulnerability

See [SECURITY.md](https://github.com/samdidos/vscode-json-schema-preview/blob/main/SECURITY.md).
Please do not open a public issue for a security report.
