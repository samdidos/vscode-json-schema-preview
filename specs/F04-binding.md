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

### Local Schema Path Resolution

- **F04-FR-13** When the picked schema is a local file, the stored `url` /
  `$schema` value MUST be a `./`-prefixed relative path **only** for
  WorkspaceFolder scope **and only when the schema file lives in the same
  workspace folder as the data file being bound**. In every other case the
  value MUST be the absolute file system path, because:
  - a relative `url` is resolved against the **data file's** workspace folder
    (both by VS Code's language servers reading the folder's
    `.vscode/settings.json` and by this extension's own validator), so a path
    made relative to a *different* workspace folder of a multi-root workspace
    would silently resolve inside the wrong project;
  - relative `json.schemas` / `yaml.schemas` `url` resolution is documented
    as unreliable once the setting is defined outside a single folder's own
    `.vscode/settings.json` (see microsoft/vscode#156006, #181187, #92348),
    which previously caused schema loading to silently fail for
    Workspace-scoped bindings; and
  - User (Global) settings apply machine-wide and have no single workspace
    folder to resolve a relative path against.
  - When the picked schema file is outside the workspace entirely, the
    absolute path MUST be used regardless of scope (pre-existing behaviour).

### Reading Back a Binding

- **F04-FR-14** Any code that determines whether the *active* document has a
  bound schema (the status bar, the validator, F08's cache auto-revalidation)
  MUST resolve `json.schemas` / `yaml.schemas` the same way VS Code itself
  does for that document: scoped to the document's own resource (so a
  WorkspaceFolder-scoped entry written in a *different* folder's
  `.vscode/settings.json` is correctly excluded), and checked against
  **every** scope that can hold a binding for that document — Global,
  Workspace, and the document's own WorkspaceFolder — since a workspace can
  contain bindings written at different scopes for different files
  simultaneously. Matching MUST try both path forms a binding can be stored
  in (plain folder-relative, from WorkspaceFolder/Global scope, and
  workspace-root-relative with a folder-name prefix, from Workspace scope in
  a multi-root workspace — see F04-FR-13 and `relFileForTarget`), since which
  form applies depends on which scope produced the entry, not on which scope
  is being read.

## Acceptance Criteria

1. Binding `person-valid.json` to `person.schema.json` at Workspace scope adds an
   entry to `.vscode/settings.json` under `json.schemas`.
2. The status bar shows `$(check) Schema: person.schema.json` after binding.
3. After removal the status bar reverts to `$(circle-slash) Schema: unbound`.
4. Binding a local schema at Workspace or User scope stores the absolute file
   system path; binding the same schema at WorkspaceFolder scope stores a
   `./`-relative path instead (F04-FR-13).
5. In a multi-root workspace, binding a schema that lives in a *different*
   workspace folder than the data file stores the absolute path at every
   scope — never a `./`-relative path that would resolve inside the data
   file's own folder (F04-FR-13).
6. In a multi-root workspace with two folders, a WorkspaceFolder-scoped
   binding written in folder A is recognised by the status bar and validator
   for files in folder A, and does not leak into folder B; a Workspace-scoped
   binding (folder-prefixed `fileMatch`) is recognised for the file it names
   regardless of which folder is currently active (F04-FR-14).
