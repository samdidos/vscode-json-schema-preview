# Configuration

All settings are in the `jsonschema` namespace and can be set in **User**, **Workspace**, or **Folder** settings.

---

## `jsonschema.preview.autoOpen`

| Type | Default |
|------|---------|
| `boolean` | `false` |

When `true`, the preview panel opens automatically whenever a JSON Schema file becomes the active editor (on file open or tab switch).

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

When `true`, the preview refreshes as you type (debounced). The preview panel **must already be open** — live update does not auto-open the panel.

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

## `jsonschema.config.json`

The extension stores schema bindings (set via [Bind Schema to This File](/guide/commands#json-schema-bind-schema-to-this-file)) and preview template preferences in a `jsonschema.config.json` file at the workspace root.

Example:

```json
{
  "template": "js",
  "bindings": {
    "data/user.json": "schemas/user.schema.json",
    "data/product.yaml": ["schemas/product.schema.json"]
  }
}
```

The file is created automatically the first time you use **Configure Preview** or **Bind Schema to This File**. You can commit it alongside your project.

### Supported templates

Templates are provided by [`json-schema-for-humans`](https://github.com/coveooss/json-schema-for-humans). Common values:

| Value | Description |
|-------|-------------|
| `js` | JavaScript-style (default) |
| `md` | Markdown table |
| `md_nested` | Nested Markdown |
| `rst` | reStructuredText |
| `html` | Standalone HTML |
