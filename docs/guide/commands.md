# Commands

All commands are available in the **Command Palette** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>⌘⇧P</kbd>).

Commands that act on the current file are also available as **editor toolbar icons** when a JSON or YAML schema file is active.

---

## JSON Schema: Preview

**ID:** `jsonschema.preview`

Opens (or focuses) the preview panel for the active schema file. The panel renders the schema as visual documentation using `json-schema-for-humans`.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (eye icon) | ✅ |

---

## JSON Schema: Edit (visual)

**ID:** `jsonschema.edit`

Opens a form-based editor panel for the active schema file. Edit the most common JSON Schema keywords without touching raw JSON. Saving from the form writes back to the source file and the preview reloads automatically.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (pencil icon) | ✅ |

---

## JSON Schema: Configure Preview

**ID:** `jsonschema.configure`

Opens the preview configuration panel for the current workspace, letting you select a `json-schema-for-humans` template and toggle options through a UI.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (gear icon) | ✅ |

---

## JSON Schema: Open Config File

**ID:** `jsonschema.openConfig`

Opens the `jsonschema.config.json` configuration file for the current workspace directly in the editor.

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ |

---

## JSON Schema: Bind Schema to This File

**ID:** `jsonschema.bindToCurrentFile`

Shows a Quick Pick list of all schema files in the workspace and binds the selected schema to the currently active file. The binding is stored in `jsonschema.config.json` and shown in the status bar.

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ |

---

## JSON Schema: Validate This File

**ID:** `jsonschema.validateFile`

Validates the active JSON or YAML file against its bound schema (see [Bind Schema to This File](#json-schema-bind-schema-to-this-file)). Validation errors appear in the **Problems** panel with precise line/column locations.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (checkmark icon) | ✅ |

---

## JSON Schema: Generate Schema from This File

**ID:** `jsonschema.inferSchema`

Infers a JSON Schema from the active JSON or YAML data file using `genson-js`. Opens the generated schema in a new editor tab. A great starting point for adopting schema-first workflows.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (wand icon) | ✅ |
