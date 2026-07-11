# JSON Schema Preview

[![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/samdidos.json-schema-preview?label=VS%20Marketplace&logo=visual-studio-code&logoColor=white&color=0065A9)](https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/samdidos.json-schema-preview?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/samdidos.json-schema-preview?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview)
[![CI](https://img.shields.io/github/actions/workflow/status/samdidos/vscode-json-schema-preview/ci.yml?label=CI&logo=github)](https://github.com/samdidos/vscode-json-schema-preview/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/github/actions/workflow/status/samdidos/vscode-json-schema-preview/docs.yml?label=docs&logo=github)](https://samdidos.github.io/vscode-json-schema-preview/)
[![Coverage](https://img.shields.io/badge/coverage-88.2%25-brightgreen)](https://github.com/samdidos/vscode-json-schema-preview/actions/workflows/ci.yml)
[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-0366d6?logo=dependabot)](https://github.com/samdidos/vscode-json-schema-preview/blob/main/.github/dependabot.yml)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.96.0-blue?logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
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

<!-- spec:F01 -->
Renders schemas as clean HTML documentation.
<!-- spec:F03,F11 -->
Validates JSON, YAML, and TOML data files inline.
<!-- spec:F07 -->
Handles schemas behind authentication (GitHub private repos, Artifactory, any HTTP endpoint) with zero friction.

---

## Highlights

<!-- spec:F01 -->
- **Preview** — schemas rendered as live, navigable HTML documentation in a side panel.
<!-- spec:F03,F04 -->
- **Validate & bind** — bind a schema to a data file (or use its inline `$schema`) and catch errors in the Problems panel.
<!-- spec:F07,F08 -->
- **Private schemas** — authenticate against GitHub, Artifactory, or any HTTPS endpoint, and cache schemas locally so IntelliSense works too.
<!-- spec:F06,F16,F18 -->
- **Generate** — infer a schema from existing data, generate valid sample data from a schema, or generate TypeScript types from a schema.

📖 **[Full documentation & feature list](https://samdidos.github.io/vscode-json-schema-preview/)** — visual editing, schema catalogs, `$ref` navigation, bundling, diffing, linting, and more.

> Supports JSON, YAML, JSONC, JSONL, and TOML formats

---

## Getting Started

Install from the VS Code Marketplace, then open a file with a `$schema` field and run **JSON Schema: Preview** — or bind a schema to a data file and run **JSON Schema: Validate This File**.

**[Getting Started guide →](https://samdidos.github.io/vscode-json-schema-preview/guide/)** — installation, requirements, and workspace trust.

---

<!-- spec:F07,F08 start -->
## Private & Authenticated Schemas

When a schema is behind authentication, VS Code's language server can't fetch it — it draws a red squiggle and IntelliSense goes dark. This extension authenticates on your behalf (GitHub OAuth, Bearer token, or Basic auth) and can cache the schema locally so the built-in language servers see it too.

**[Authentication guide →](https://samdidos.github.io/vscode-json-schema-preview/guide/authentication)**
<!-- spec:F07,F08 end -->

---

## Commands

All features are reachable from the Command Palette, with matching editor toolbar icons for the active file.

**[Full command reference →](https://samdidos.github.io/vscode-json-schema-preview/guide/commands)**

---

<!-- spec:F09 start -->
## Configuration

All settings live under the `jsonschema.*` namespace (User, Workspace, or Folder scope). Drop a `.json-schema-preview-config.json` in your workspace root to customise the [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) renderer.

**[Full settings reference →](https://samdidos.github.io/vscode-json-schema-preview/guide/configuration)**
<!-- spec:F09 end -->

---

## Security, Privacy & Accessibility

<!-- spec:S05 -->
- **Zero telemetry** — the extension collects and transmits nothing about your usage; the only network requests it makes are the ones you trigger.
<!-- spec:S01 -->
- **Hardened webviews** — a nonce-based Content Security Policy and HTML-escaped schema content in every panel.
<!-- spec:S04 -->
- **Offline-friendly** — falls back to the last cached schema copy when the network is unreachable, and tells you it did so.
<!-- spec:S06 -->
- **Accessible by default** — every injected control is keyboard-operable and screen-reader-labelled; state is never colour-only.

---

## Credits

Rendering powered by [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans).
