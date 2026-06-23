# Commands

All commands are available in the **Command Palette** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>⌘⇧P</kbd>).

Commands that act on the current file are also available as **editor toolbar icons** when a JSON or YAML file is active.

---

## JSON Schema: Preview

**ID:** `jsonschema.preview`

Opens (or focuses) the preview panel for the active schema file. The panel renders the schema as visual documentation using `json-schema-for-humans`. A **Download** button in the bottom-right corner saves the generated output (HTML or Markdown, depending on the active template).

Disabled in untrusted workspaces — see [Workspace Trust](/guide/#workspace-trust).

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

Opens the preview configuration panel for the current workspace, letting you select a `json-schema-for-humans` template and toggle options through a UI form. Saves the result to `.json-schema-preview-config.json` in your workspace root.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (gear icon) | ✅ |

---

## JSON Schema: Open Config File

**ID:** `jsonschema.openConfig`

Opens the `.json-schema-preview-config.json` configuration file directly in the editor. The file is discovered from the workspace folder that contains the active schema, with fallback to other workspace folders.

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ |

---

## JSON Schema: Bind Schema…

**ID:** `jsonschema.bindToCurrentFile`

Shows a Quick Pick list of all schema files in the workspace and binds the selected schema to the currently active data file. The binding is written to VS Code's `json.schemas` / `yaml.schemas` settings at the scope you choose (workspace file, folder, or user). The status bar updates to show the bound schema name.

Also available via **right-click** in the editor and the **Explorer** context menu.

| Toolbar | Command Palette | Context Menu |
|---------|----------------|---|
| — | ✅ | ✅ |

---

## JSON Schema: Validate This File

**ID:** `jsonschema.validateFile`

Validates the active JSON or YAML file against its bound schema (see [Bind Schema…](#json-schema-bind-schema)) using AJV. Errors appear in the **Problems** panel with precise line/column locations.

If the file already has an inline `$schema` field the bound schema is inferred from it — no explicit binding needed.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (checkmark icon, data files only) | ✅ |

---

## JSON Schema: Generate Schema from This File

**ID:** `jsonschema.inferSchema`

Infers a JSON Schema from the active JSON, JSONC, JSONL, or YAML data file using `genson-js`. Opens the generated schema in a new editor tab beside the original. A great starting point for adopting schema-first workflows.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (wand icon, data files only) | ✅ |

---

## JSON Schema: Configure Schema Authentication…

**ID:** `jsonschema.configureSchemaAuth`

Sets up credentials for a remote schema host so the extension (and VS Code's language server) can fetch it. Supports:

- **GitHub OAuth** — signs in using your existing VS Code GitHub session; no token to paste.
- **Bearer token** — for Artifactory, private registries, or any HTTPS endpoint.
- **Basic auth** — username + password stored in your OS keychain via VS Code's Secret Storage API.

The command is also reachable from:
- The **lightbulb** that appears on the `$schema` line when VS Code can't fetch it
- The error message shown by **Validate This File** when the schema returns 401/403
- The **🔒 / 🔓 status bar item** in the bottom bar (click to configure)

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ |

---

## JSON Schema: Cache Schema Locally

**ID:** `jsonschema.cacheSchemaLocally`

Downloads the remote schema (using stored credentials) and saves it as a local file. Rewrites the `json.schemas` / `yaml.schemas` entry to point at the local copy so VS Code's built-in JSON language server and the Red Hat YAML extension both see it — eliminating the red squiggle and restoring IntelliSense.

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ (hidden from palette by default) |

---

## JSON Schema: Refresh Schema Cache

**ID:** `jsonschema.refreshSchemaCache`

Re-downloads a previously cached schema from its original remote URL. Use this when the remote schema has changed and you want the local cache to reflect the latest version.

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ |
