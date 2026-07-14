# Commands

All commands are available in the **Command Palette** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>⌘⇧P</kbd>).

Commands that act on the current file are also available as **editor toolbar icons** when a JSON or YAML file is active.

---

<!-- spec:F01 start -->
## JSON Schema: Preview

**ID:** `jsonschema.preview`

Opens (or focuses) the preview panel for the active schema file. The panel renders the schema as visual documentation using `json-schema-for-humans`. A **Download** button in the bottom-right corner saves the generated output (HTML or Markdown, depending on the active template).

Disabled in untrusted workspaces — see [Workspace Trust](/guide/#workspace-trust).

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (eye icon) | ✅ |
<!-- spec:F01 end -->

---

<!-- spec:F05 start -->
## JSON Schema: Edit (visual)

**ID:** `jsonschema.edit`

Opens a form-based editor panel for the active schema file. Edit the most common JSON Schema keywords without touching raw JSON. Saving from the form writes back to the source file and the preview reloads automatically.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (pencil icon) | ✅ |
<!-- spec:F05 end -->

---

<!-- spec:F09 start -->
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
<!-- spec:F09 end -->

---

<!-- spec:F04,F10,F12 start -->
## JSON Schema: Bind Schema…

**ID:** `jsonschema.bindToCurrentFile`

Shows a Quick Pick list of all schema files in the workspace and binds the selected schema to the currently active data file. The binding is written to VS Code's `json.schemas` / `yaml.schemas` settings at the scope you choose (workspace file, folder, or user), or inline as the file's own `$schema` field. A **Browse catalog…** entry searches SchemaStore and any configured private catalogs instead of pasting a URL. The status bar updates to show the bound schema name.

Also available via **right-click** in the editor and the **Explorer** context menu.

| Toolbar | Command Palette | Context Menu |
|---------|----------------|---|
| — | ✅ | ✅ |
<!-- spec:F04,F10,F12 end -->

---

<!-- spec:F03 start -->
## JSON Schema: Validate This File

**ID:** `jsonschema.validateFile`

Validates the active JSON, YAML, or TOML file against its bound schema (see [Bind Schema…](#json-schema-bind-schema)) using AJV. Errors appear in the **Problems** panel with precise line/column locations.

If the file already has an inline `$schema` field the bound schema is inferred from it — no explicit binding needed.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (checkmark icon, data files only) | ✅ |
<!-- spec:F03 end -->

<!-- spec:F21 start -->
### Quick fixes for validation errors

For JSON and JSONC files, the validation errors above carry a **lightbulb** (💡) offering a one-click repair when the fix is unambiguous: insert a **missing required property** with a type-appropriate placeholder, **remove an unexpected property**, replace a value that is outside an `enum`/`const` with an allowed one, or **coerce a mistyped scalar** (e.g. `"5"` → `5`) when the conversion is lossless. Only safe, mechanical fixes are offered — errors whose correct value can't be known (a `pattern`, a numeric bound, a `format`) have no quick fix. Fixes are computed against the file's current text, so they stay correct after edits and a fix whose target you've already removed simply disappears.
<!-- spec:F21 end -->


---

<!-- spec:F06,F11 start -->
## JSON Schema: Generate Schema from This File

**ID:** `jsonschema.inferSchema`

Infers a JSON Schema from the active JSON, JSONC, JSONL, YAML, or TOML data file using `genson-js`. Opens the generated schema in a new editor tab beside the original. A great starting point for adopting schema-first workflows.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (wand icon, data files only) | ✅ |
<!-- spec:F06,F11 end -->

---

<!-- spec:F16 start -->
## JSON Schema: Generate Sample Data from This Schema

**ID:** `jsonschema.generateSampleData`

The inverse of inference: generates a valid example instance from the active JSON Schema, honouring `const`/`examples`/`default`/`enum` and common format/constraint keywords where present. Choose JSON or YAML output; the result opens in a new editor tab beside the schema. Useful for seeding fixtures or trying out a schema you just bound.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (beaker icon, schema files only) | ✅ |
<!-- spec:F16 end -->

---

<!-- spec:F20 start -->
## JSON Schema: Validate Workspace

**ID:** `jsonschema.validateWorkspace`

The "is my repo green?" button: one command that sweeps the whole workspace (all folders in a multi-root setup), validates every data file with a schema binding — settings-based at any scope, or an inline `$schema` — and lints every schema file with the F17 rule set. Findings land in the Problems panel on their real file locations, including files that aren't open; a binding whose schema can't be loaded gets a diagnostic pointing at the binding itself (the inline `$schema` line, or the settings-file line naming the schema). Each run replaces the previous run's diagnostics.

The run shows cancellable progress and finishes with a summary — files checked, valid, with errors, schemas linted, bindings failed — plus a **Copy Report** action that puts a per-folder Markdown report on the clipboard, ready to paste into a PR comment.

Discovery respects `files.exclude`/`search.exclude`, skips files over 1 MiB, and caps the scan at `jsonschema.workspaceValidation.maxFiles` (default 2000, noted in the report when hit). Remote schemas are read cache-first and fetched at most once per run; in an untrusted workspace they're served from the local cache only.

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ (when a workspace folder is open) |
<!-- spec:F20 end -->

---

<!-- spec:F18 start -->
## JSON Schema: Generate Types from This Schema

**ID:** `jsonschema.generateTypes`

Generates typed declarations from the active JSON Schema — the compile-time counterpart of sample-data generation. A language picker offers **TypeScript** (the default) plus **Python, Go, Rust, Java, C#, Kotlin, Swift, Dart, and C++**, all emitted by the same deterministic engine. For TypeScript: `required` properties become mandatory members, `enum`s become unions of literal types, `description`s become TSDoc comments, and each `$defs` entry becomes a named declaration (recursive schemas self-reference and always terminate). Constraints no type system can express (`pattern`, `minimum`, `if`/`then`, …) are noted in each language's doc-comments instead of being silently dropped.

After the language pick, choose the destination: a **new untitled editor** (default), or **Save to a file…** — a native save dialog pre-filled with `<schema-name>.<ext>` next to the schema, which writes the file and opens it. **Java** is special: the language requires one file per class, so saving asks for a **folder** instead and writes every generated `.java` file into it (confirming first if any would be overwritten), then opens the top-level class; the untitled editor shows all classes in one document separated by `// <FileName>.java` banners as a preview. Cancelling either dialog falls back to the untitled editor, so generated output is never lost.

External `$ref`s are resolved with the same machinery as bundling — relative files from disk, remote refs preferring the local schema cache and using stored credentials — before any code is generated; output is deterministic per language, so regenerated files only change when the schema does. Also offered from the **Bind Schema…** success notification, right after binding a data file.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (interface icon, schema files only) | ✅ |
<!-- spec:F18 end -->

---

<!-- spec:F14 start -->
## JSON Schema: Bundle / Dereference Schema

**ID:** `jsonschema.bundleSchema`

Flattens a multi-file schema into one self-contained document, opened in a new editor tab — the source file is never modified. Two modes:

- **Bundle** — external refs are pulled into `$defs` and rewritten to local pointers (round-trippable).
- **Dereference** — refs are replaced inline by their targets (maximally portable); cyclic references are detected and kept as `$defs` refs so expansion always terminates.

Remote refs resolve using stored credentials and prefer an existing local cache entry over the network. Resolution runs under cancellable progress showing which document is currently being fetched. The root schema's `$schema`/`$id` are always preserved; any nested `$id` that would change resolution semantics after inlining is stripped and called out in the completion message. To bound memory on very large schema trees, the operation aborts with a clear error past a cap of 100 external documents.

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (references icon, schema files only) | ✅ |
<!-- spec:F14 end -->

---

<!-- spec:F15 start -->
## JSON Schema: Diff Against Baseline

**ID:** `jsonschema.diffSchema`

Compares the active schema against a baseline — Git HEAD, another workspace file, or a remote URL — and classifies every change as **breaking**, **non-breaking**, **informational**, or **unclassified** for instance-document compatibility. Shows a one-line summary with a button to open the full grouped report (a read-only document listing each change's JSON Pointer path and old → new values).

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (diff icon, schema files only) | ✅ |
<!-- spec:F15 end -->

---

<!-- spec:F22 start -->
## JSON Schema: Migrate to Draft…

**ID:** `jsonschema.migrateDraft`

Rewrites the active schema between drafts — **draft-07**, **2019-09**, and **2020-12** — applying the well-known keyword changes and reporting exactly how many it made. Upgrading modernises `id` → `$id`, boolean `exclusiveMinimum`/`exclusiveMaximum` → their numeric form, `definitions` → `$defs` (with local `$ref`s rewritten to match), tuple `items` → `prefixItems` (and `additionalItems` → `items`), and splits `dependencies` into `dependentRequired`/`dependentSchemas`; downgrading reverses each of these. The transform recurses through every subschema and, like the diff command, leaves anything it cannot safely convert untouched rather than guessing. The result opens in a new editor beside the source — JSON for JSON sources, YAML for YAML — so the original file is never modified; a schema that already conforms reports "nothing to migrate".

| Toolbar | Command Palette |
|---------|----------------|
| ✅ (swap icon, schema files only) | ✅ |
<!-- spec:F22 end -->

---

<!-- spec:F17 start -->
## JSON Schema: Insert $schema Declaration

**ID:** `jsonschema.lint.insertSchemaDeclaration`

Inserts a `$schema` declaration into the active schema file, prompting for which JSON Schema draft to target (2020-12 first). Offered as a quick fix by the built-in schema linter when a schema is missing this declaration — see [Configuration](/guide/configuration) for the linter's settings.

| Toolbar | Command Palette |
|---------|----------------|
| — | ✅ |
<!-- spec:F17 end -->

---

<!-- spec:F07 start -->
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
<!-- spec:F07 end -->

---

<!-- spec:F08 start -->
## JSON Schema: Cache Schema Locally

**ID:** `jsonschema.cacheSchemaLocally`

Downloads the remote schema (using stored credentials) and saves it as a local file. Rewrites the `json.schemas` / `yaml.schemas` entry to point at the local copy so VS Code's built-in JSON language server and the Red Hat YAML extension both see it — eliminating the red squiggle and restoring IntelliSense. Can also be revalidated automatically — see `jsonschema.cache.autoRefresh` in [Configuration](/guide/configuration).

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
<!-- spec:F08 end -->
