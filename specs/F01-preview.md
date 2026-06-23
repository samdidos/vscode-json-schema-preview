# F01 — Schema Preview Panel

## Overview

The extension renders a JSON Schema document as human-readable HTML documentation
in a VS Code webview panel beside the editor. Rendering is delegated to the
`json-schema-for-humans` Python tool.

## User Stories

- As a schema author, I want to see a formatted view of my schema so I can review
  it without reading raw JSON or YAML.
- As a team lead, I want to share rendered schema documentation with colleagues
  who do not have the extension installed (via the Download button).

## Functional Requirements

### Activation

- **F01-FR-01** The extension MUST activate on files with `languageId` in
  `json`, `jsonc`, `yaml`, `yml`, or `jsonl`.
- **F01-FR-02** A file SHALL be considered a JSON Schema file if its parsed root
  object contains a `$schema` key (JSON/JSONC) or the first line matching
  `^\$schema:` is present (YAML).
- **F01-FR-03** When a schema file is the active editor the VS Code context key
  `jsonschema.isJsonSchema` MUST be set to `true`; it MUST be set to `false`
  for all other files.

### Preview Command

- **F01-FR-04** The command `jsonschema.preview` MUST open the preview panel in
  `ViewColumn.Two`.
- **F01-FR-05** If the preview for a given file is already open the command MUST
  focus the existing panel rather than opening a duplicate.
- **F01-FR-06** The panel title MUST be the basename of the schema file.
- **F01-FR-07** While the Python tool is running the panel MUST display a
  loading message.
- **F01-FR-08** The preview MUST be regenerated and the panel refreshed every
  time the schema file is saved.

### Toolbar and Context Menu

- **F01-FR-09** The **Preview** toolbar icon (eye) MUST appear in the editor
  title bar only when `jsonschema.isJsonSchema` is `true`.

### Config File Discovery

- **F01-FR-10** The extension MUST search for `.json-schema-preview-config.json`
  starting from the workspace folder that owns the schema file, falling back to
  other workspace folders in order.
- **F01-FR-11** When no config file is found the extension MUST pass
  `--config template_name=flat` to `json-schema-for-humans`.

### Download Button

- **F01-FR-12** The rendered preview MUST include a floating **Download** button
  in the bottom-right corner.
- **F01-FR-13** Clicking Download MUST open a Save dialog pre-filled with the
  schema filename stem and the correct extension (`.html` for HTML templates,
  `.md` for Markdown templates).
- **F01-FR-14** The raw generated content MUST be written verbatim to the
  chosen path.

### External Links

- **F01-FR-15** Clicking any `<a href>` in the rendered HTML that is not a
  fragment anchor (`#…`) MUST open the URL in the user's default browser via
  `vscode.env.openExternal`.
- **F01-FR-16** Fragment anchors MUST scroll within the webview normally.

### Scroll Position

- **F01-FR-17** When the preview panel is refreshed (on save) the webview MUST
  restore the previous scroll position.

### Error Handling

- **F01-FR-18** If `json-schema-for-humans` is not installed the error page MUST
  display a contextual hint with the `pip install` command.
- **F01-FR-19** If the Python interpreter is not found the error page MUST
  display a hint directing the user to install Python 3 or select an interpreter
  via the VS Code Python extension.
- **F01-FR-20** If generation times out the error page MUST show a timeout hint.

## Non-Functional Requirements

- **F01-NFR-01** The panel MUST use `retainContextWhenHidden: true` to avoid
  re-running the Python tool on every tab switch (accepted memory tradeoff).
- **F01-NFR-02** The webview's `localResourceRoots` MUST be scoped to the
  directory of the schema file being rendered.

## Acceptance Criteria

1. Opening a `.json` file with `"$schema": "…"` and running **JSON Schema: Preview**
   shows a populated documentation panel within the timeout period.
2. Saving the schema file causes the preview to refresh automatically.
3. The Download button produces a file whose content matches what the Python tool
   generated.
4. Clicking an `http://…` link inside the preview opens a browser tab.
