# F10 — Inline Schema Binding via `$schema` Field

## Overview

When a user binds a JSON Schema to a data file, they can choose an **Inline**
scope in addition to the existing VS Code settings scopes. An inline binding
writes the schema reference directly into the data file as a `$schema` field
rather than into VS Code settings. This makes the binding portable across
editors and tools that honour `$schema` without requiring any `.vscode/` files.

The feature builds on the existing `bindToCurrentFile` command (F04) by adding
an "Inline" option to the scope picker. It also allows removing an inline
binding via the same command. JSONL is explicitly excluded (see Out of Scope).

## User Stories

- As a developer sharing JSON data files with other tools (e.g. ajv, Postman),
  I want the schema reference embedded in the file as `"$schema"` so those
  tools pick it up automatically without needing VS Code settings.
- As a YAML author, I want to add a `$schema:` key at the top of my YAML file
  so the schema is self-describing and travels with the file in any editor.
- As a developer removing a schema link, I want to be able to strip the
  `$schema` field that was written inline just as easily as I added it.

## Functional Requirements

### Scope Picker

- **F10-FR-01** When `jsonschema.bindToCurrentFile` is invoked on a supported
  file, the scope picker MUST include an **Inline (this file)** option above
  the existing folder/workspace/user options.
- **F10-FR-02** The **Inline** option MUST NOT be offered for `.jsonl` files
  (see Out of Scope).
- **F10-FR-03** The **Inline** option MUST be offered when removing a binding
  if the active file already contains a `$schema` field.

### Writing an Inline Binding — JSON / JSONC

- **F10-FR-04** For JSON and JSONC files, the command MUST insert or replace
  the `"$schema"` property as the **first key** in the root object using a
  workspace edit so the change appears in the undo stack.
- **F10-FR-05** The `"$schema"` value MUST be a path relative to the
  workspace folder (prefixed `./`) when the schema is a local file inside the
  same workspace, consistent with the existing settings-based binding path
  resolution. When the schema is outside the workspace, the absolute file
  system path MUST be used and the command MUST display an information message
  warning the user that the embedded path is machine-specific and reduces
  portability.
- **F10-FR-06** If the file is not a JSON object at the root level (e.g. an
  array, a scalar), the command MUST show an error message and abort without
  modifying the file.
- **F10-FR-07** For JSONC files, the operation MUST preserve all existing
  `//` and `/* */` comments in the remainder of the file.

### Writing an Inline Binding — YAML / YML

- **F10-FR-08** For YAML files, the command MUST insert or replace a schema
  reference as the **first non-comment line** in the file using a workspace
  edit.
- **F10-FR-09** The notation style for YAML follows this priority order:
  1. **Preserve existing form** — if the file already contains a
     `# yaml-language-server: $schema=...` directive, update that directive
     in place; if it contains a plain `$schema:` key, update that key in place.
  2. **Detect the YAML extension** — for files with no existing schema
     notation, check whether the `redhat.vscode-yaml` extension is installed
     (`vscode.extensions.getExtension('redhat.vscode-yaml')`):
     - If installed → write `# yaml-language-server: $schema=<ref>` (the
       extension consumes this directive to drive IntelliSense and validation).
     - If not installed → write `$schema: <ref>` (plain YAML key, recognised
       by most non-VS Code YAML tooling).
- **F10-FR-16** The extension MUST NOT change the notation style of a YAML
  file that already has a schema reference — switching forms is an explicit
  out-of-scope change for this feature.

### Removing an Inline Binding

- **F10-FR-10** When **Remove** is chosen via the scope picker and the active
  file has an inline `$schema` field, the command MUST remove that field using
  a workspace edit, leaving the rest of the file intact.
- **F10-FR-11** For JSON/JSONC removal, the command MUST also remove the
  trailing comma after `$schema` (if it is the only first property) or the
  preceding comma (if other properties follow) so the result is valid JSON.

### Status Bar

- **F10-FR-12** When the active document's schema reference was detected from
  an inline `$schema` field, the status bar MUST display
  `$(file-symlink-file) Schema: <basename>` to distinguish inline bindings
  from settings-based bindings.
- **F10-FR-13** The tooltip for an inline-bound file MUST include a note such
  as "Inline $schema in this file" and the resolved schema path.

### Detection / Precedence

- **F10-FR-14** `extractInlineSchemaUrl` (already exported) MUST be used as
  the authoritative source for detecting whether an inline binding exists.
- **F10-FR-15** An inline `$schema` field MUST take precedence over any
  settings-based binding for the purposes of the status bar display. When both
  exist the status bar SHOULD indicate the inline value is active and SHOULD
  warn the user that a settings binding also exists.

## Non-Functional Requirements

- **F10-NFR-01** All file mutations MUST be applied via `vscode.WorkspaceEdit`
  (not `fs.writeFileSync`) so changes are undoable and are shown as unsaved
  edits rather than silent on-disk writes.
- **F10-NFR-02** The implementation MUST NOT block the extension host — no
  synchronous file I/O.
- **F10-NFR-03** The feature MUST work when the file has not been saved yet
  (untitled documents are excluded by F04 precedent; saved-but-unsaved-changes
  documents MUST be handled correctly).

## Out of Scope

- **JSONL files**: JSONL (newline-delimited JSON) has no standardised
  `$schema` mechanism. Each line is an independent JSON value; inserting
  `$schema` into every record would corrupt homogeneous datasets, and a
  comment-line approach (`// $schema: ...`) is non-standard. JSONL schemas
  remain settings-based only (F04).
- **Multi-root inline `$schema` for JSONL** — deferred to a future spec if a
  community standard emerges.
- Validating that the provided schema path actually resolves — that is handled
  by F03 (validation) and F07 (auth).
- Switching an existing YAML file's notation style (e.g. converting a
  `yaml-language-server:` directive to a plain `$schema:` key or vice versa)
  — the existing form is always preserved (F10-FR-16).

## Acceptance Criteria

1. Running **Bind Schema…** on `person-valid.json` and choosing **Inline**
   inserts `"$schema": "./schemas/person.schema.json"` as the first key.
2. Running **Bind Schema…** on `data.yaml` (no existing notation,
   `redhat.vscode-yaml` not installed) and choosing **Inline** inserts
   `$schema: ./schemas/person.schema.json` as the first line.
2a. Same scenario with `redhat.vscode-yaml` installed inserts
    `# yaml-language-server: $schema=./schemas/person.schema.json` instead.
2b. If `data.yaml` already had a `# yaml-language-server: $schema=...` line,
    only that line is updated in place — the notation form is not changed.
3. Running **Bind Schema…** on `data.jsonl` does NOT show the **Inline**
   option in the scope picker.
4. After an inline binding the status bar shows
   `$(file-symlink-file) Schema: person.schema.json`.
5. Running **Remove** on an inline-bound JSON file removes the `"$schema"`
   property and leaves the remaining JSON valid (no dangling commas).
6. A JSON file that has a root-level array shows an error when the user picks
   **Inline** and the file is not modified.
7. All mutations appear in the undo stack (Ctrl+Z reverts the change).

## Open Questions

All questions resolved — no open items.

<!-- Resolved questions (for audit trail):

Q1 — YAML notation style [resolved by user]
  Decision: preserve the existing form in the file; for fresh bindings detect
  whether `redhat.vscode-yaml` is installed and choose directive vs plain key
  accordingly. Form-switching is out of scope. See F10-FR-09, F10-FR-16.

Q2 — Absolute path outside workspace [resolved by derivation]
  Decision: use the absolute path (consistent with existing settings-binding
  path resolution in SchemaBindingManager lines 222-225) and show an
  information message warning about reduced portability. See F10-FR-05.

Q3 — Show Inline in Remove picker when no inline binding exists [resolved by derivation]
  Decision: only offer "Inline" in the Remove picker when extractInlineSchemaUrl
  detects a $schema field in the file. Offering a destructive option with
  nothing to remove would be confusing and inconsistent with the existing Remove
  binding UX. See F10-FR-03.
-->

## Relation to Existing Specs

- Extends **F04** (binding command, status bar, context menus) — new scope
  option added to `pickScope`; existing settings-based path unchanged.
- Uses **F04-FR-05** status bar display rules — F10-FR-12 adds a new icon
  variant for inline bindings.
- `extractInlineSchemaUrl` already used by **F03** (validation) — no conflict;
  F10 adds the write path for the same function's read result.
- **S01** (security): workspace edits are safe; no raw HTML involved.
- **S02** (workspace trust): inline binding writes to disk — MUST be blocked
  in untrusted workspaces, consistent with other write operations.
