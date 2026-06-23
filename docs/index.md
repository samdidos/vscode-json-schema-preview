---
layout: home

hero:
  name: JSON Schema Preview
  text: Visualise, validate & edit schemas in VS Code
  tagline: A developer-friendly extension that renders JSON Schema documents as interactive visual documentation — with live preview, validation, a form-based editor, and support for private/authenticated schemas.
  image:
    src: /logo.svg
    alt: JSON Schema Preview logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/samdidos/vscode-json-schema-preview
    - theme: alt
      text: Releases
      link: https://github.com/samdidos/vscode-json-schema-preview/releases

features:
  - icon: 👁
    title: Live Preview
    details: Renders your JSON or YAML schema as human-readable documentation the moment you save. Debounced live-update mode refreshes as you type. Download the output as HTML or Markdown.

  - icon: ✅
    title: Instant Validation
    details: Validates any JSON or YAML data file against its bound schema using AJV. Errors appear inline in the Problems panel with precise line and column locations.

  - icon: ✏️
    title: Visual Editor
    details: Edit the most common JSON Schema keywords through a structured form — no raw JSON needed. Saves back to the source file automatically.

  - icon: 🔗
    title: Schema Binding
    details: Bind any JSON or YAML data file to a schema and track it in the status bar. Bindings are stored in VS Code settings (workspace folder or user scope).

  - icon: 🪄
    title: Schema Inference
    details: Generate a JSON Schema from an existing data file with one command. Supports JSON, JSONC, JSONL, and YAML. A great starting point when adopting schema-first workflows.

  - icon: 🔒
    title: Private Schema Auth
    details: Fetch schemas behind GitHub OAuth, Bearer tokens, or Basic auth. Cache them locally so VS Code's language server reads them too — no more red squiggles.

  - icon: 🛡️
    title: Workspace Trust Aware
    details: The Python-based preview is disabled in untrusted workspaces. Validation, binding, and inference continue to work in Restricted Mode.

  - icon: ⚙️
    title: Configurable Rendering
    details: Choose from multiple json-schema-for-humans templates (flat, JS, Markdown, RST, HTML). Config lives in .json-schema-preview-config.json, committed alongside your project.
---
