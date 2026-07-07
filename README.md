# JSON Schema Preview

[![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/samdidos.json-schema-preview?label=VS%20Marketplace&logo=visual-studio-code&logoColor=white&color=0065A9)](https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/samdidos.json-schema-preview?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/samdidos.json-schema-preview?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview)
[![CI](https://img.shields.io/github/actions/workflow/status/samdidos/vscode-json-schema-preview/ci.yml?label=CI&logo=github)](https://github.com/samdidos/vscode-json-schema-preview/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/github/actions/workflow/status/samdidos/vscode-json-schema-preview/docs.yml?label=docs&logo=github)](https://samdidos.github.io/vscode-json-schema-preview/)
[![Coverage](https://img.shields.io/badge/coverage-87.2%25-brightgreen)](https://github.com/samdidos/vscode-json-schema-preview/actions/workflows/ci.yml)
[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-0366d6?logo=dependabot)](https://github.com/samdidos/vscode-json-schema-preview/blob/main/.github/dependabot.yml)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.125.0-blue?logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org/)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/samdidos/vscode-json-schema-preview/codeql.yml?label=CodeQL&logo=github)](https://github.com/samdidos/vscode-json-schema-preview/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/samdidos/vscode-json-schema-preview/badge)](https://securityscorecards.dev/viewer/?uri=github.com/samdidos/vscode-json-schema-preview)
[![SLSA Level 2](https://img.shields.io/badge/SLSA-Level%202-green)](https://slsa.dev)
[![Mutation tested with Stryker](https://img.shields.io/badge/mutation%20tested-Stryker-%23E74C3C)](https://stryker-mutator.io)
[![Maintained with Knip](https://img.shields.io/badge/maintained%20with-knip-%23F56E0F)](https://knip.dev)
[![Tested with fast-check](https://img.shields.io/badge/tested%20with-fast--check-%23282661)](https://fast-check.dev)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Code style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?logo=prettier&logoColor=white)](https://prettier.io)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/samdidos/vscode-json-schema-preview/blob/main/CONTRIBUTING.md)
[![GitHub release](https://img.shields.io/github/v/release/samdidos/vscode-json-schema-preview?logo=github&label=release)](https://github.com/samdidos/vscode-json-schema-preview/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/samdidos/vscode-json-schema-preview/blob/main/LICENSE.md)

**Preview, validate, and work with JSON Schemas — including private ones — right inside VS Code.**

<!-- spec:F01,F03,F07,F11 -->
Renders schemas as clean HTML documentation. Validates JSON, YAML, and TOML data files inline. Handles schemas behind authentication (GitHub private repos, Artifactory, any HTTP endpoint) with zero friction.

---

## Features

<!-- spec:F01,F02,F03,F04,F05,F06,F07,F08,F12,F13,F14,F15,F16,F17 start -->
| | |
|---|---|
| **Preview** | Renders any JSON/YAML schema as navigable HTML documentation in a side panel |
| **Edit visually** | Edit common JSON Schema keywords through a form UI — no raw JSON |
| **Validate** | Validates data files against a bound schema with inline error highlighting |
| **Bind schemas** | Link a data file to a schema (workspace or user scope) for validation & IntelliSense |
| **Browse catalog** | Search SchemaStore and your own private catalogs to bind a schema without hunting for the URL |
| **Authenticate** | Fetches schemas from private endpoints using GitHub OAuth or stored tokens |
| **Cache locally** | Downloads authenticated schemas once so VS Code's language server uses them too — with optional automatic revalidation |
| **Infer schemas** | Generates a draft schema from any existing data file |
| **Sample data** | Generates a valid example instance *from* a schema (the inverse of infer) |
| **Navigate `$ref`** | Go-to-definition and hover on `$ref` — local, cross-file, and cached remote |
| **Bundle / dereference** | Flatten a multi-file schema into one document — refs into `$defs`, or fully inlined |
| **Diff schemas** | Compare against Git HEAD, a file, or a URL and classify each change as breaking / non-breaking |
| **Lint schemas** | Flags quality issues in the schema itself: missing descriptions, unknown keywords, duplicate enums |
| **Live reload** | Preview refreshes as you type |
<!-- spec:F01,F02,F03,F04,F05,F06,F07,F08,F12,F13,F14,F15,F16,F17 end -->

<!-- spec:F03,F11 -->
> Supports JSON, YAML, JSONC, JSONL, and TOML formats

---

## Getting Started

### Prerequisites

<!-- spec:F01 -->
Python 3 on your `PATH`. The extension installs [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) on first use via `pip` — nothing else needed.

<!-- spec:F01,F02 start -->
### Preview a schema

Open any file with a `$schema` field. Click the **Preview** button in the editor title bar, or run **JSON Schema: Preview** from the Command Palette.
<!-- spec:F01,F02 end -->

<!-- spec:F03,F04,F10 start -->
### Validate a data file

Bind a schema via the **Bind Schema** icon in the title bar (or right-click in the explorer), then run **JSON Schema: Validate This File**. Errors appear in the Problems panel. If the file already has a `$schema` field, validation uses it automatically — no binding required.
<!-- spec:F03,F04,F10 end -->

---

<!-- spec:F07,F08 start -->
## Private and Authenticated Schemas

When a schema is behind authentication, VS Code's language server gets a 401, draws a red squiggle, and IntelliSense goes dark. This extension fixes that.

### Setup

**GitHub private repos** — uses your existing VS Code GitHub session. Run **JSON Schema: Configure Schema Authentication…** and select *Sign in with GitHub*. Nothing to paste.

**Artifactory / any HTTPS endpoint** — same command, choose *Bearer token* or *Basic auth*. Credentials are stored in your OS keychain via VS Code's Secret Storage API.

### Discovery paths

You don't need to hunt for the command. Authentication setup is surfaced wherever the problem appears:

- **Lightbulb on the `$schema` line** — when VS Code can't load the schema, a code action appears directly on the problem line
- **Validate command** — if fetching the schema returns a 401/403, the error message has a *Configure Auth* button
- **Status bar** — a `🔒` / `🔓` indicator shows auth status for the current file's schema; click it to configure

<!-- spec:F08 start -->
### Eliminating the red squiggle (Option 4)

After configuring auth, you can cache the schema to a local file. The extension rewrites the `json.schemas` / `yaml.schemas` entry to point at the local copy — so the built-in JSON language server and the Red Hat YAML extension both read it successfully. The squiggle disappears and IntelliSense works.

The lightbulb offers **Cache schema locally** directly, or you can run **JSON Schema: Cache Schema Locally** from the palette. Refresh the cache any time with **JSON Schema: Refresh Schema Cache**. Automatic revalidation can be enabled via `jsonschema.cache.autoRefresh`.
<!-- spec:F08 end -->
<!-- spec:F07,F08 end -->

---

<!-- spec:F01,F03,F04,F05,F06,F07,F08,F09,F14,F15,F16,F17 start -->
## Commands

| Command | Description |
|---|---|
| **JSON Schema: Preview** | Open the documentation panel |
| **JSON Schema: Edit (visual)** | Edit schema properties in a form UI |
| **JSON Schema: Bind Schema…** | Bind a schema to the current data file |
| **JSON Schema: Validate This File** | Validate against the bound (or inline) schema |
| **JSON Schema: Generate Schema from This File** | Infer a schema from existing data |
| **JSON Schema: Generate Sample Data from This Schema** | Produce a valid example instance from a schema |
| **JSON Schema: Bundle / Dereference Schema** | Flatten a multi-file schema — refs into `$defs`, or fully inlined |
| **JSON Schema: Diff Against Baseline** | Compare against Git HEAD, a file, or a URL and classify each change |
| **JSON Schema: Insert $schema Declaration** | Add a draft `$schema` to a schema file (lint quick fix) |
| **JSON Schema: Configure Schema Authentication…** | Set up credentials for a remote host |
| **JSON Schema: Cache Schema Locally** | Download with auth and redirect the language server |
| **JSON Schema: Refresh Schema Cache** | Re-download a previously cached schema |
| **JSON Schema: Configure Preview** | Adjust rendering options |
| **JSON Schema: Open Config File** | Open `.json-schema-preview-config.json` |
<!-- spec:F01,F03,F04,F05,F06,F07,F08,F09,F14,F15,F16,F17 end -->

---

<!-- spec:F01,F02,F03,F07,F08,F09,F12,F17,S03 start -->
## Configuration

| Setting | Default | Description |
|---|---|---|
| `jsonschema.preview.autoOpen` | `false` | Open preview automatically when a schema file is activated |
| `jsonschema.preview.liveUpdate` | `false` | Refresh preview while typing |
| `jsonschema.preview.liveUpdateDelay` | `1500` | Debounce delay in ms |
| `jsonschema.preview.renderTimeout` | `30000` | Milliseconds before the render subprocess is killed |
| `jsonschema.remoteFetchTimeout` | `30000` | Milliseconds before an outbound remote-schema request is aborted |
| `jsonschema.cache.autoRefresh` | `off` | Revalidate cached schemas via conditional requests (`off` / `onOpen` / `daily`) |
| `jsonschema.catalog.useSchemaStore` | `true` | Include the public SchemaStore catalog in **Bind Schema… → Browse catalog…** |
| `jsonschema.catalog.sources` | `[]` | Additional private catalog URLs, in the SchemaStore catalog format |
| `jsonschema.lint.enabled` | `true` | Report schema-quality diagnostics on schema files |
| `jsonschema.lint.rules` | `{}` | Per-rule severity overrides (`off` / `hint` / `info` / `warning`) |
<!-- spec:F01,F02,F03,F07,F08,F09,F12,F17,S03 end -->

<!-- spec:F09 -->
Drop a `.json-schema-preview-config.json` in your workspace root to customise the renderer — all [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) options are supported, including alternative templates.

---

<!-- spec:F04,F10,F11 start -->
## Schema Binding Scopes

| Scope | Stored in | Lifetime |
|---|---|---|
| Workspace file | `.code-workspace` file | Committed with repo (multi-root workspaces only) |
| Workspace folder | `.vscode/settings.json` | Committed with the repo |
| User | User `settings.json` | All workspaces on this machine |
| Inline (`$schema` field) | The data file itself | Portable to other editors and tools; the only scope available for TOML |
<!-- spec:F04,F10,F11 end -->

---

<!-- spec:S01,S04,S05,S06 start -->
## Security, Privacy & Accessibility

- **Zero telemetry** — the extension collects and transmits nothing about your usage; the only network requests it makes are the ones you trigger (fetching a schema, its catalog, or a diff baseline). <!-- spec:S05 -->
- **Hardened webviews** — the preview, visual editor, and config panels run under a nonce-based Content Security Policy with no unsanctioned inline scripts, and all schema-derived content is HTML-escaped before rendering. <!-- spec:S01 -->
- **Offline-friendly** — if a remote schema becomes unreachable during validation, the extension falls back to the last successfully cached copy rather than failing outright, and tells you it did so. <!-- spec:S04 -->
- **Accessible by default** — every control the extension injects into a webview is keyboard-operable and screen-reader-labelled, and status (like required fields) is never conveyed by colour alone. <!-- spec:S06 -->
<!-- spec:S01,S04,S05,S06 end -->

---

## Credits

Rendering powered by [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans).
