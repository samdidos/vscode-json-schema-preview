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

<!-- spec:F28 start -->
## `jsonschema.preview.syncScroll`

| Type | Default |
|------|---------|
| `boolean` | `true` |

When `true`, the preview panel and the schema editor keep each other in view — bidirectionally. Scrolling, or clicking a line, in the schema editor moves the open preview panel; scrolling the preview panel moves the editor's viewport back. Either direction resolves the exact matching section when it can (a position directly under nested `properties`/`patternProperties`/`items`), otherwise falls back to the proportionally equivalent position. Neither direction re-renders the preview or edits the document — the preview leg just repositions the panel, and the editor leg just reveals a range (never moving the cursor/selection). A brief cooldown after each sync keeps the two directions from fighting each other.

```json
{
  "jsonschema.preview.syncScroll": false
}
```
<!-- spec:F28 end -->

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

<!-- spec:F24 start -->
## `jsonschema.refGraph.maxDepth`

| Type | Default | Minimum |
|------|---------|---------|
| `number` | `3` | `1` |

When you opt into resolving external `$ref`s in the [**$ref dependency graph**](/guide/commands#json-schema-view-ref-dependency-graph) view, how many documents deep to fetch and follow further refs before showing the remainder as unfetched endpoint nodes.

```json
{
  "jsonschema.refGraph.maxDepth": 5
}
```
<!-- spec:F24 end -->

---

<!-- spec:F20 start -->
## `jsonschema.workspaceValidation.maxFiles`

| Type | Default | Minimum |
|------|---------|---------|
| `number` | `2000` | `1` |

Maximum number of files the **JSON Schema: Validate Workspace** command scans in one run. When the workspace has more matching files than this, the run is truncated and the summary report notes it. Discovery already honours `files.exclude` / `search.exclude` and skips files over 1 MiB; this cap bounds the total regardless.

```json
{
  "jsonschema.workspaceValidation.maxFiles": 5000
}
```
<!-- spec:F20 end -->

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

The **Browse catalog…** picker (opened from [Bind Schema…](/guide/commands#json-schema-bind-schema)) is filterable by schema name and description, and shows the source catalog and URL as each entry's detail. Entries whose `fileMatch` glob matches the file you're binding are ranked first, under a "Suggested for this file" separator. Fetched catalogs are cached for 24 hours in global storage — reopening the picker within that window never hits the network — and if a refetch fails and a cached copy exists, the picker falls back to it and marks the title as offline/stale rather than failing outright.
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
## Preview Configuration: File or Settings

`json-schema-for-humans` (the renderer behind the preview panel) is controlled by configuration that can live in either of two places, checked in this order:

1. **`.json-schema-preview-config.json`** — a standalone, git-committable file. If found, it is always used, and `jsonschema.config` (below) is ignored entirely.
2. **`jsonschema.config`** — a VS Code setting, used only when no config file is found.

This means a team can commit a config file for deterministic, machine-independent output, while an individual contributor without one can still configure the renderer through their own settings.

### `.json-schema-preview-config.json`

The extension discovers this file in the workspace folder that contains the schema being rendered (with fallback to other workspace folders in order). Create or edit it via **JSON Schema: Open Config File**.

```json
{
  "template_name": "js",
  "show_toc": true
}
```

### `jsonschema.config` setting

The same configuration, set directly in `settings.json` instead of a file. Set at **User**, **Workspace**, or **Workspace Folder** scope — VS Code's native precedence applies, so a folder/workspace value always overrides a user value, exactly like a local file overriding a global default.

```json
// .vscode/settings.json
{
  "jsonschema.config": {
    "template_name": "js",
    "show_toc": true
  }
}
```

Run **JSON Schema: Configure Preview** and pick a scope (User / Workspace / Workspace Folder) — the extension creates the `jsonschema.config` key at that scope if it doesn't already have one, then opens the corresponding `settings.json` with the key revealed, so you land directly on the right setting instead of hunting for it.

Unlike the standalone file, this setting's shape is validated and auto-completed directly in `settings.json` — the extension declares it (mirroring the well-known `json-schema-for-humans` options, e.g. `template_name` as an enum of the supported templates) via its `contributes.configuration` entry in `package.json`. A `$schema` key has no effect inside a nested settings value — VS Code resolves `$schema` at the document level, and `settings.json` is already validated against VS Code's own generated meta-schema — so this contributed schema is the only way to get that validation for a setting.

Both the file and the setting accept the same [json-schema-for-humans options](https://github.com/coveooss/json-schema-for-humans#configuration).

### Output templates

The `template_name` field controls the rendered format, in either the file or the setting:

| Value | Output | Notes |
|-------|--------|-------|
| `flat` | HTML | Default when no config file and no `jsonschema.config` setting are present |
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

For a fresh inline binding on a **YAML** file, the extension picks the notation automatically: if the [Red Hat YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) is installed it writes a `# yaml-language-server: $schema=...` comment directive, otherwise a plain `$schema:` key. If the file already has either form, that existing form is always updated in place — the extension never switches a file from one notation to the other.
<!-- spec:F04,F10,F11 end -->

<!-- spec:F19 start -->
## TOML Schema IntelliSense

While VS Code's own language servers provide schema-driven editing help for JSON and YAML, TOML has no schema-aware language server — so this extension fills the gap itself. In any `.toml` file with an inline `"$schema"` binding you get:

- **Key completions** from the schema's properties, scoped to the current `[table]` / `[[array-of-tables]]` header and dotted-key path. Keys already present in the table are omitted; schema-`required` keys sort first and are marked `(required)`.
- **Value completions** after `=` for `enum`/`const` alternatives and booleans, serialised as valid TOML (quoted strings, bare numbers).
- **Hover documentation** on keys showing the schema's title, type, description, enum values, and numeric bounds.

Schema `$ref`s are followed (local pointers, files next to the schema, cached remote schemas). Everything works offline: a remote schema is read from the local cache — run **JSON Schema: Cache Schema Locally** once to populate it — and no request is ever made while you type. Removing the `$schema` line turns the assistance off.
<!-- spec:F19 end -->

<!-- spec:F03 start -->
## `jsonschema.validation.onSave`

**Type:** `"off"` \| `"bound"` \| `"always"` · **Default:** `"off"`

Re-validate a data file when it is saved.

- `off` — validation stays an explicit action.
- `bound` — re-validate files with an explicit binding (inline `$schema` or a
  settings binding).
- `always` — also re-validate files whose schema VS Code resolves natively (the
  **(auto)** state in the status bar).

Automatic runs are **silent**: diagnostics only, no notifications. They never
fetch an uncached remote schema, so saving is never blocked on the network.

This is the gap VS Code's own language servers leave open — they validate JSON
live, but not YAML, TOML, JSONL, or anything behind authentication.
<!-- spec:F03 end -->

<!-- spec:F26 -->
## `jsonschema.compat.codeLens`

**Type:** `boolean` · **Default:** `true`

Show a CodeLens on a schema's first line counting the breaking changes against
its Git `HEAD` version. Computed in the background from the same classifier as
**Diff Against Baseline**, so typing is never blocked. No Git baseline, or no
changes, means no lens.

<!-- spec:F32 start -->
## `jsonschema.ai.enabled`

**Type:** `boolean` · **Default:** `false`

Enable the AI-assisted authoring commands. **Off by default**, and while it is
off no code path can reach a model request.

When on, the command you run sends the artifact it operates on — plus the file's
base name — to the language model configured in VS Code, through the editor's own
Language Model API. This extension ships no model, no API key and no provider
endpoint, and collects no telemetry.

See [AI assistance](/guide/ai) for the full list of what each command sends and
the verification every result goes through.

## `jsonschema.ai.maxAttempts`

**Type:** `number` · **Default:** `3` · **Range:** 1–5

How many times an AI command retries when its result fails verification, feeding
the concrete failures back each time. After the last attempt the result is shown
explicitly marked unverified — never silently.
<!-- spec:F32 end -->

<!-- spec:F17 -->
## Lint rules

Two rules check a schema's own annotations against itself, which no language
server does:

- **`valid-examples`** — every entry of an `examples` array must satisfy the
  subschema that declares it.
- **`valid-default`** — a `default` value must satisfy its own subschema.

Both skip a subschema carrying a `$ref`, so an unresolved reference never
produces a false positive. Override severity through
[`jsonschema.lint.rules`](#jsonschema-lint-rules) like any other rule.
