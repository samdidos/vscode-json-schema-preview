# F09 — Preview Configuration: File and Settings

## Overview

`json-schema-for-humans` rendering (F01) is controlled by configuration that
can live in either of two places, checked in this order:

1. A standalone, workspace-discovered file (`.json-schema-preview-config.json`)
   — portable, git-committable, shared by every contributor who opens the repo.
2. The `jsonschema.config` VS Code setting — no file to commit, and it can be
   set at User (global), Workspace, or Workspace Folder scope, with VS Code's
   native scope precedence (Workspace Folder > Workspace > User) resolving
   which value applies.

The file always wins when both are present (F09-FR-13): teams with a committed
config file keep deterministic, machine-independent output, while individual
contributors without one can still configure the renderer per-machine or
per-workspace through ordinary settings.

## User Stories

- As a schema author, I want to switch the preview template to Markdown without
  editing JSON manually.
- As a team, we want to commit a shared config file so all contributors see the
  same rendered output.
- As an individual contributor without a committed config file, I want to set
  my preferred template and options in my own VS Code settings — globally, or
  just for one workspace — without creating a file the rest of the team didn't
  ask for.

## Functional Requirements

### Configure Command (Settings-Based)

- **F09-FR-01** The command `jsonschema.configure` MUST prompt the user to
  choose a settings scope (F09-FR-14), then open that scope's `settings.json`
  with the `jsonschema.config` key ready to edit (creating it as `{}` first if
  the scope doesn't already declare it).
- **F09-FR-02** The configuration toolbar icon (gear) MUST appear only when
  `jsonschema.isJsonSchema` is `true`.

### `jsonschema.config` Setting

- **F09-FR-12** A `jsonschema.config` object setting (scope `resource`, so it
  can be set per Workspace Folder) lets users configure
  `json-schema-for-humans` directly in VS Code settings instead of the
  standalone file. Its shape MUST be declared under `contributes.configuration`
  in `package.json`, mirroring the well-known properties of the upstream
  `json-schema-for-humans` config schema (`template_name` as an enum of the
  supported templates, and the other documented boolean/string/object options)
  with `additionalProperties` left open for forward compatibility with tool
  options this extension doesn't yet know about. This is the only way to
  enforce a data model on a settings value in VS Code — an inline `$schema`
  key has no meaning inside a nested settings value, since `$schema` is
  resolved at the document level and `settings.json` is already validated
  against VS Code's own generated meta-schema.
- **F09-FR-13** Reading precedence: if `.json-schema-preview-config.json`
  (F09-FR-06/07/08) is found, it MUST be used and `jsonschema.config` MUST be
  ignored entirely; only when no file is found does the extension fall back to
  `jsonschema.config`, resolved for the schema file's own resource so
  VS Code's native Workspace Folder > Workspace > User precedence applies
  (a folder/workspace value always overrides a user/global one, matching the
  file's own local-over-global principle).
- **F09-FR-14** The scope picker (used by F09-FR-01) MUST offer **User**
  (global `settings.json`), **Workspace** (the `.code-workspace` file, only
  when one is active), and **Workspace Folder** (the `.vscode/settings.json`
  of the workspace folder that owns the active editor's document, falling
  back to the first workspace folder when there is no active document) —
  mirroring the scope picker already used by **Bind Schema…** (F04), which
  likewise resolves a single contextual folder rather than enumerating every
  folder in a multi-root workspace.

### Open Config File Command (File-Based)

- **F09-FR-04** The command `jsonschema.openConfig` MUST open the
  `.json-schema-preview-config.json` file in the editor.
- **F09-FR-05** If no config file exists the command MUST create an empty one
  at the workspace root before opening it.
- **F09-FR-03** Opening an existing config file MUST show its current on-disk
  content unmodified — the command MUST NOT overwrite existing values.

### Config File Discovery (Multi-Root)

- **F09-FR-06** The config file MUST be searched for starting from the workspace
  folder that contains the active schema file.
- **F09-FR-07** If no config file is found in the schema's folder the extension
  MUST fall back to the other workspace folders in order.
- **F09-FR-08** When no config file is found in any workspace folder, and the
  `jsonschema.config` setting (F09-FR-12/13) is also unset or empty, the Python
  tool MUST be called with `--config template_name=flat`.

### Saving (File-Based)

- **F09-FR-09** Editing `.json-schema-preview-config.json` directly in the
  editor and saving it MUST be reflected on the next preview render — there is
  no separate form to keep in sync, the file on disk is the source of truth.
- **F09-FR-10** After saving the config file, the preview panel for the schema
  that owns it SHOULD refresh to reflect the new template.

### Security

- **F09-FR-11** Any webview this feature opens (none currently — both commands
  operate on plain text editors) MUST use a nonce-based CSP (see S01) if one is
  ever added.

## Acceptance Criteria

1. Running **JSON Schema: Configure Preview** with no workspace folders open
   still offers **User Settings** and lands in the global `settings.json` with
   `jsonschema.config` ready to edit.
2. In a project with no `.json-schema-preview-config.json`, setting
   `"jsonschema.config": {"template_name": "md"}` in `.vscode/settings.json`
   and re-running the preview renders Markdown output.
3. Adding a `.json-schema-preview-config.json` file to that same project makes
   the file's `template_name` win over the `jsonschema.config` setting.
4. Running **Open Config File** opens the `.json-schema-preview-config.json`
   in the editor, creating it first if absent.
5. `settings.json` shows autocomplete/validation for `jsonschema.config.template_name`
   restricted to the known template names.
