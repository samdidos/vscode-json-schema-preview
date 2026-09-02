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
    - theme: brand
      text: Install from Marketplace
      link: https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview
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
    details: Validates any JSON, YAML, or TOML data file against its bound schema using AJV. Errors appear inline in the Problems panel with precise line and column locations.

  - icon: ✏️
    title: Visual Editor
    details: Edit the most common JSON Schema keywords through a structured form — no raw JSON needed. Saves back to the source file automatically.

  - icon: 🔗
    title: Schema Binding
    details: Bind any JSON, YAML, or TOML data file to a schema and track it in the status bar. Bindings are stored in VS Code settings (workspace folder or user scope), or inline via $schema.

  - icon: 🪄
    title: Schema Inference
    details: Generate a JSON Schema from an existing data file with one command. Supports JSON, JSONC, JSONL, YAML, and TOML. A great starting point when adopting schema-first workflows.

  - icon: 🔒
    title: Private Schema Auth
    details: Fetch schemas behind GitHub OAuth, Bearer tokens, or Basic auth. Cache them locally so VS Code's language server reads them too — no more red squiggles.

  - icon: 🛡️
    title: Workspace Trust Aware
    details: The Python-based preview is disabled in untrusted workspaces. Validation, binding, and inference continue to work in Restricted Mode.

  - icon: ⚙️
    title: Configurable Rendering
    details: Choose from multiple json-schema-for-humans templates (flat, JS, Markdown, RST, HTML). Config lives in .json-schema-preview-config.json committed alongside your project, or in the jsonschema.config VS Code setting.

  - icon: 🧪
    title: Schema Tests
    details: Pin the documents a schema must accept and must reject in a *.schema.test.json file. Runs in the editor, in the workspace sweep, and headlessly in CI — so a schema change that starts accepting garbage fails a test instead of reaching production.

  - icon: 🧰
    title: Schema Refactorings
    details: Extract a subschema to $defs, inline a $ref, rename a definition across every reference, find all references, and delete definitions nothing reaches. Each one refuses rather than guessing when it cannot preserve meaning.

  - icon: 🧭
    title: Schema-aware Outline
    details: The Outline view, breadcrumbs and Go-to-Symbol show the schema's shape — a property, its type, whether it is required — instead of a chain of "properties" nodes.

  - icon: 🤖
    title: Tools for AI Agents
    details: The deterministic engines exposed as language model tools in VS Code and over MCP via "jstk mcp", so an agent checks whether a change is breaking instead of guessing. Optional, opt-in AI drafting is verified against those same engines before anything is offered.
---

<!--
  The feature cards above (frontmatter) are each tagged below, in the same
  order, since HTML comments inside VitePress YAML frontmatter would risk
  breaking the frontmatter parse.
-->
<!-- spec:F01,F02 --> <!-- Live Preview -->
<!-- spec:F03,F11 --> <!-- Instant Validation (JSON/YAML/TOML) -->
<!-- spec:F05 --> <!-- Visual Editor -->
<!-- spec:F04,F11 --> <!-- Schema Binding (JSON/YAML/TOML) -->
<!-- spec:F06,F11 --> <!-- Schema Inference (JSON/JSONC/JSONL/YAML/TOML) -->
<!-- spec:F07,F08 --> <!-- Private Schema Auth -->
<!-- spec:S02 --> <!-- Workspace Trust Aware -->
<!-- spec:F09 --> <!-- Configurable Rendering -->
<!-- spec:F29 --> <!-- Schema Tests -->
<!-- spec:F30 --> <!-- Schema Refactorings -->
<!-- spec:F31 --> <!-- Schema-aware Outline -->
<!-- spec:F33,F32 --> <!-- Tools for AI Agents -->
