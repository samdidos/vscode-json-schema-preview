# Configuration

All settings are in the `jsonschema` namespace and can be set in **User**, **Workspace**, or **Folder** settings.

---

## `jsonschema.preview.autoOpen`

| Type | Default |
|------|---------|
| `boolean` | `false` |

When `true`, the preview panel opens automatically whenever a JSON Schema file becomes the active editor (on file open or tab switch). Silently skipped in untrusted workspaces.

```json
// .vscode/settings.json
{
  "jsonschema.preview.autoOpen": true
}
```

---

## `jsonschema.preview.liveUpdate`

| Type | Default |
|------|---------|
| `boolean` | `false` |

When `true`, the preview refreshes as you type (debounced). The preview panel **must already be open** — live update does not auto-open the panel. Skipped in untrusted workspaces.

```json
{
  "jsonschema.preview.liveUpdate": true
}
```

---

## `jsonschema.preview.liveUpdateDelay`

| Type | Default | Minimum |
|------|---------|---------|
| `number` (ms) | `1500` | `500` |

Milliseconds to wait after the last keystroke before the live preview refreshes. Increase this value on slower machines.

```json
{
  "jsonschema.preview.liveUpdateDelay": 800
}
```

---

## `.json-schema-preview-config.json`

The extension discovers a `.json-schema-preview-config.json` file in the workspace folder that contains the schema being rendered (with fallback to other workspace folders in order). The file controls the `json-schema-for-humans` renderer and the output template.

Example:

```json
{
  "template_name": "js",
  "show_toc": true
}
```

All [json-schema-for-humans options](https://github.com/coveooss/json-schema-for-humans) are supported. Create or edit the file via **JSON Schema: Configure Preview** (visual UI) or **JSON Schema: Open Config File** (opens the raw JSON).

### Output templates

The `template_name` field controls the rendered format:

| Value | Output | Notes |
|-------|--------|-------|
| `flat` | HTML | Default when no config file is present |
| `js` | HTML | JavaScript-style collapsible tree |
| `md` | Markdown | Markdown table; displayed as raw source in VS Code, downloadable as `.md` |
| `md_nested` | Markdown | Nested Markdown structure |
| `rst` | reStructuredText | Plain text display |
| `html` | Standalone HTML | Self-contained file with embedded styles |

The **Download** button in the preview panel uses the correct extension (`.html` or `.md`) based on the active template.

---

## Schema Binding (`json.schemas` / `yaml.schemas`)

Schema bindings created via **Bind Schema…** are written to VS Code's standard `json.schemas` (for JSON/JSONC/JSONL files) and `yaml.schemas` (for YAML files) settings. Choose the scope when prompted:

| Scope | Stored in | Lifetime |
|---|---|---|
| Workspace file | `.code-workspace` file | Committed with the repo (multi-root workspaces only) |
| Workspace folder | `.vscode/settings.json` | Committed with the repo |
| User | User `settings.json` | All workspaces on this machine |

Bindings can be edited manually in the relevant `settings.json` file.
