# Configuration

All settings are in the `jsonschema` namespace and can be set in **User**, **Workspace**, or **Folder** settings.

---

<!-- spec:F01 start -->
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
<!-- spec:F01 end -->

---

<!-- spec:F02 start -->
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
<!-- spec:F02 end -->

---

<!-- spec:F01,S03 start -->
## `jsonschema.preview.renderer`

| Type | Default | Values |
|------|---------|--------|
| `string` | `"auto"` | `"auto"`, `"builtin"` |

Which engine renders the schema preview:

- **`auto`** — use the richer [`json-schema-for-humans`](https://github.com/coveooss/json-schema-for-humans) (Python) output when it is available, and fall back to the extension's built-in renderer otherwise.
- **`builtin`** — always use the built-in, dependency-free renderer and never invoke Python. Choose this if you don't have (or don't want) a Python interpreter: the preview appears immediately with no interpreter probe or install prompt.

```json
{
  "jsonschema.preview.renderer": "builtin"
}
```

---

## `jsonschema.preview.renderTimeout`

| Type | Default | Minimum |
|------|---------|---------|
| `number` (ms) | `30000` | `1000` |

Milliseconds to wait for the `json-schema-for-humans` render subprocess before it is killed and an error page (with a timeout hint) is shown instead. Values below the minimum are clamped.

```json
{
  "jsonschema.preview.renderTimeout": 60000
}
```
<!-- spec:F01,S03 end -->

---

<!-- spec:F07,F08,F12,S03 start -->
## `jsonschema.remoteFetchTimeout`

| Type | Default | Minimum |
|------|---------|---------|
| `number` (ms) | `30000` | `1000` |

Milliseconds to wait for any outbound remote-schema HTTP request — authentication fetches, schema caching, and catalog lookups all share this timeout — before it is aborted.

```json
{
  "jsonschema.remoteFetchTimeout": 15000
}
```
<!-- spec:F07,F08,F12,S03 end -->

---

<!-- spec:F08 start -->
## `jsonschema.cache.autoRefresh`

| Type | Default | Values |
|------|---------|--------|
| `string` | `"off"` | `off`, `onOpen`, `daily` |

Automatically revalidates a locally cached schema against its origin using conditional (`ETag` / `Last-Modified`) requests. `off` never revalidates automatically; `onOpen` revalidates a schema at most once per session when a bound file becomes the active editor; `daily` revalidates at most once every 24 hours. A `304 Not Modified` response leaves the cache untouched, and a failed revalidation is silent — the stale cached copy keeps serving IntelliSense.

```json
{
  "jsonschema.cache.autoRefresh": "onOpen"
}
```
<!-- spec:F08 end -->

---

<!-- spec:F12 start -->
## `jsonschema.catalog.useSchemaStore`

| Type | Default |
|------|---------|
| `boolean` | `true` |

Includes the public [SchemaStore](https://www.schemastore.org) catalog in the **Bind Schema… → Browse catalog…** picker.

## `jsonschema.catalog.sources`

| Type | Default |
|------|---------|
| `array` of `string` | `[]` |

Additional schema-catalog URLs in the SchemaStore catalog format (`{ "schemas": [{ "name", "description", "url", "fileMatch" }] }`). Private catalogs are fetched with the credentials configured via **Configure Schema Authentication…**.

```json
{
  "jsonschema.catalog.sources": ["https://internal.example.com/schema-catalog.json"]
}
```
<!-- spec:F12 end -->

---

<!-- spec:F17 start -->
## `jsonschema.lint.enabled`

| Type | Default |
|------|---------|
| `boolean` | `true` |

Reports schema-quality diagnostics — missing `description`/`$schema`, unknown keywords, duplicate enums, and similar — on JSON Schema files, in a dedicated Problems-panel source separate from data-file validation.

## `jsonschema.lint.rules`

| Type | Default |
|------|---------|
| `object` | `{}` |

Per-rule severity overrides. Map a rule id to `off`, `hint`, `info`, or `warning`. Rule ids: `no-unknown-keywords`, `require-schema-declaration`, `require-root-id`, `require-descriptions`, `explicit-additional-properties`, `no-duplicate-enum`, `no-empty-required`.

```json
{
  "jsonschema.lint.rules": {
    "require-descriptions": "off",
    "no-unknown-keywords": "warning"
  }
}
```
<!-- spec:F17 end -->

---

<!-- spec:F09 start -->
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
<!-- spec:F09 end -->

---

<!-- spec:F04,F10,F11 start -->
## Schema Binding (`json.schemas` / `yaml.schemas`)

Schema bindings created via **Bind Schema…** are written to VS Code's standard `json.schemas` (for JSON/JSONC/JSONL files) and `yaml.schemas` (for YAML files) settings, or inline as the file's own `$schema` field. Choose the scope when prompted:

| Scope | Stored in | Lifetime |
|---|---|---|
| Workspace file | `.code-workspace` file | Committed with the repo (multi-root workspaces only) |
| Workspace folder | `.vscode/settings.json` | Committed with the repo |
| User | User `settings.json` | All workspaces on this machine |
| Inline (`$schema` field) | The data file itself | Portable to other editors and tools |

Bindings can be edited manually in the relevant `settings.json` file. **TOML files use the inline scope exclusively** — VS Code has no built-in `toml.schemas` mechanism, so the picker offers only the inline option for `.toml` files.
<!-- spec:F04,F10,F11 end -->

<!-- spec:F19 start -->
## TOML Schema IntelliSense

While VS Code's own language servers provide schema-driven editing help for JSON and YAML, TOML has no schema-aware language server — so this extension fills the gap itself. In any `.toml` file with an inline `"$schema"` binding you get:

- **Key completions** from the schema's properties, scoped to the current `[table]` / `[[array-of-tables]]` header and dotted-key path. Keys already present in the table are omitted; schema-`required` keys sort first and are marked `(required)`.
- **Value completions** after `=` for `enum`/`const` alternatives and booleans, serialised as valid TOML (quoted strings, bare numbers).
- **Hover documentation** on keys showing the schema's title, type, description, enum values, and numeric bounds.

Schema `$ref`s are followed (local pointers, files next to the schema, cached remote schemas). Everything works offline: a remote schema is read from the local cache — run **JSON Schema: Cache Schema Locally** once to populate it — and no request is ever made while you type. Removing the `$schema` line turns the assistance off.
<!-- spec:F19 end -->
