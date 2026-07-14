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
  object contains a `$schema` key (JSON/JSONC) or a line matching `^\$schema:`
  is present (YAML), **and** that key's value is a URL string whose hostname is
  exactly `json-schema.org` (the meta-schema host for every draft from
  draft-04 through 2020-12) — determined by parsing the value as a URL and
  comparing its hostname, not by a substring/`includes` check, which would
  also match an unrelated or attacker-controlled host such as
  `json-schema.org.evil.com` or `evil.com/?x=json-schema.org`. A `$schema`
  value that does not resolve to that hostname — e.g. a data file bound to a
  schema via its own inline `$schema` field (F10), which points *at* a schema
  file rather than declaring itself to be one — MUST NOT be considered a JSON
  Schema file.
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

### Python Interpreter and Dependency Management

- **F01-FR-23** The extension MUST resolve the Python interpreter in this
  order: the active environment reported by the VS Code Python extension
  (`ms-python.python`, environments API with legacy-API fallback), then the
  `python.defaultInterpreterPath` / `python.pythonPath` setting, then plain
  `python3` on the `PATH`.
- **F01-FR-24** Before rendering, if the `json_schema_for_humans` package is
  not importable under the resolved interpreter, the extension MUST attempt to
  install it automatically via pip under a progress notification. Install
  attempts MUST try `--user` first and MUST include `--break-system-packages`
  variants so PEP 668 externally-managed system Pythons (Ubuntu 23.04+/Debian
  Bookworm+) are handled, before falling back to `pip3`/`pip` executables.
- **F01-FR-25** Once the package is confirmed importable under an interpreter,
  the check MUST NOT re-run for that interpreter within the same extension-host
  session.
- **F01-FR-26** If every automatic install attempt fails the resulting error
  MUST include manual installation instructions (a copy-pasteable `pip`
  command and a virtual-environment alternative).

### Error Handling

- **F01-FR-18** If `json-schema-for-humans` is not installed the error page MUST
  display a contextual hint with the `pip install` command.
- **F01-FR-19** If the Python interpreter is not found the error page MUST
  display a hint directing the user to install Python 3 or select an interpreter
  via the VS Code Python extension.
- **F01-FR-20** If generation times out the error page MUST show a timeout hint.

### Fallback Renderer

- **F01-FR-21** When the Python interpreter or the `json-schema-for-humans`
  package is unavailable, the extension MUST render a built-in, dependency-free
  HTML documentation page for the schema instead of only showing an error, so
  the schema remains previewable without Python. A schema-level error (as
  opposed to missing tooling) MUST still surface the error page.
- **F01-FR-22** The fallback page MUST be self-contained (inline styles, **no**
  scripts, a static `default-src 'none'` CSP) and MUST HTML-escape every
  schema-derived string so schema content cannot inject markup.
- **F01-FR-27** A `jsonschema.preview.renderer` setting MUST let the user
  choose the preview engine: `"auto"` (default) uses `json-schema-for-humans`
  when available and falls back to the built-in renderer otherwise (the
  F01-FR-21 behaviour); `"builtin"` MUST always use the built-in renderer and
  MUST NOT invoke Python at all — so users who don't have (or don't want)
  Python get the built-in output directly, with no interpreter probe or
  install prompt. The setting's value MUST resolve through a pure, testable
  helper that defaults to `"auto"` for any missing or unrecognised value.

## Non-Functional Requirements

- **F01-NFR-01** The panel MUST use `retainContextWhenHidden: true` to avoid
  re-running the Python tool on every tab switch (accepted memory tradeoff).
- **F01-NFR-02** The webview's `localResourceRoots` MUST be scoped to the
  directory of the schema file being rendered.
- **F01-NFR-03** The fallback page MUST expose the schema title as a top-level
  `<h1>` and nested property groups as sub-headings, and MUST NOT convey the
  required/optional distinction by colour alone (see S06-SR-04 / S06-SR-07).

## Acceptance Criteria

1. Opening a `.json` file with `"$schema": "http://json-schema.org/draft-07/schema#"`
   and running **JSON Schema: Preview** shows a populated documentation panel
   within the timeout period.
2. Saving the schema file causes the preview to refresh automatically.
3. The Download button produces a file whose content matches what the Python tool
   generated.
4. Clicking an `http://…` link inside the preview opens a browser tab.
5. A data file whose own `"$schema"` value points at a schema path (e.g.
   `"$schema": "./schemas/person.schema.json"`, written by inline binding —
   F10) is NOT treated as a JSON Schema file: `jsonschema.isJsonSchema` stays
   `false`, the Preview/Edit/Configure toolbar icons don't appear, and
   Validate/Infer icons show instead.
