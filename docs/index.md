---
layout: home

hero:
  name: JSON Schema Preview
  text: Visualise, validate & edit schemas in VS Code
  tagline: A developer-friendly extension that renders JSON Schema documents as interactive visual documentation — with live preview, validation, and a form-based editor.
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
    details: Renders your JSON or YAML schema as human-readable documentation the moment you save. Debounced live-update mode refreshes as you type.

  - icon: ✅
    title: Instant Validation
    details: Validates any JSON or YAML data file against its bound schema using AJV. Errors appear inline in the Problems panel.

  - icon: ✏️
    title: Visual Editor
    details: Edit the most common JSON Schema keywords through a structured form — no raw JSON needed. Saves back to the source file automatically.

  - icon: 🔗
    title: Schema Binding
    details: Bind any JSON or YAML data file to a schema file and track it in the status bar. Bindings are stored in <code>jsonschema.config.json</code>.

  - icon: 🪄
    title: Schema Inference
    details: Generate a JSON Schema from an existing data file with one command. A great starting point when adopting schema-first workflows.

  - icon: ⚙️
    title: Zero Configuration
    details: Works out of the box for JSON and YAML. Optional settings for auto-open preview, live-update delay, and multi-root workspaces.
---
