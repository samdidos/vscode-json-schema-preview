# Security Policy

## Supported Versions

Only the latest published version receives security fixes.

| Version | Supported |
|---------|-----------|
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting instead:
**[Report a vulnerability](https://github.com/samdidos/vscode-json-schema-preview/security/advisories/new)**

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (schema file, data file, or extension configuration that triggers it)
- VS Code version, OS, and extension version

### What to look for

Areas most likely to have security impact in this extension:

- **Webview XSS** — schema content rendered in the preview or editor panel
- **Credential exposure** — schema auth tokens stored via VS Code Secret Storage
- **Path traversal** — local schema cache file paths derived from remote URLs
- **Remote code execution** — schema or data file processing (AJV, genson-js, js-yaml)

## Response

I aim to acknowledge reports within **72 hours** and publish a fix within **14 days** for confirmed vulnerabilities. A patched release will be tagged and published to the VS Code Marketplace.
