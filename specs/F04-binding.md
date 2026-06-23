# F04 — Schema–File Binding

## Overview

The extension allows users to associate (bind) a JSON Schema file with one or more
data files. Bindings are stored in VS Code's standard `json.schemas` / `yaml.schemas`
settings entries so both the extension and VS Code's built-in language server
recognise them.

## User Stories

- As a developer, I want to bind `data/user.json` to `schemas/user.schema.json`
  so validation and IntelliSense work without adding `$schema` to every file.
- As a team lead, I want bindings committed in `.vscode/settings.json` so all
  team members get them automatically.

## Functional Requirements

### Binding Command

- **F04-FR-01** The command `jsonschema.bindToCurrentFile` MUST present a Quick
  Pick list of all JSON Schema files discovered asynchronously in the open
  workspace folder(s).
- **F04-FR-02** The user MUST be prompted to choose a scope: **Workspace file**
  (only when a `.code-workspace` file exists), **Workspace folder**, or **User**.
- **F04-FR-03** The binding MUST be written to the appropriate
  `json.schemas` / `yaml.schemas` VS Code setting at the chosen scope.
- **F04-FR-04** A YAML data file (`.yaml` / `.yml`) MUST be bound via
  `yaml.schemas`; all other supported formats MUST use `json.schemas`.

### Status Bar

- **F04-FR-05** The status bar item MUST be visible whenever a supported data
  file (JSON, JSONC, JSONL, YAML, YML) is the active editor.
- **F04-FR-06** When a schema is bound the status bar item MUST display
  `$(check) Schema: <basename>` and a tooltip showing the full schema path and
  a hint to click to change or remove.
- **F04-FR-07** When no schema is bound the status bar item MUST display
  `$(circle-slash) Schema: unbound` with a tooltip offering to bind one.
- **F04-FR-08** Clicking the status bar item MUST execute `jsonschema.bindToCurrentFile`.

### Context and Explorer Menus

- **F04-FR-09** The **Bind Schema…** entry MUST appear in the editor context menu
  for supported data files.
- **F04-FR-10** The **Bind Schema…** entry MUST appear in the Explorer context
  menu for files with extensions `.json`, `.jsonc`, `.jsonl`, `.yaml`, `.yml`.

### Local Cache Redirection

- **F04-FR-11** When a schema is cached locally (see F08) the binding that
  previously pointed at the remote URL MUST be updated to point at the local
  cache path.

### Legacy Cleanup

- **F04-FR-12** On startup the extension MUST silently clean up any session-scoped
  temporary bindings written by older versions of the extension.

## Acceptance Criteria

1. Binding `person-valid.json` to `person.schema.json` at Workspace scope adds an
   entry to `.vscode/settings.json` under `json.schemas`.
2. The status bar shows `$(check) Schema: person.schema.json` after binding.
3. After removal the status bar reverts to `$(circle-slash) Schema: unbound`.
