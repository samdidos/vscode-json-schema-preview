# F11 — TOML File Support

## Overview

Add TOML (`.toml`) as a first-class data format alongside JSON, JSONC, JSONL,
and YAML. TOML files can be validated against a JSON Schema, have a schema
inferred from their contents, and display a bound schema in the status bar.

Because VS Code has no built-in `toml.schemas` setting, and to avoid coupling
to or conflicting with third-party TOML extensions (e.g. `tamasfe.even-better-toml`,
`tamasfe.taplo`), schema binding for TOML uses **Inline only**: the `"$schema"`
key is written directly into the TOML file. This approach is also recognised
natively by every TOML tool that honours `$schema`, making it the most
portable choice. Inline `$schema` binding (F10) is extended to cover TOML
syntax.

Note: TOML is not a subset of JSON. It is its own format that maps cleanly to
JSON-compatible value types (strings, numbers, booleans, arrays, tables/objects)
but uses distinct syntax (`key = value`, `[table]` headers, `[[array-of-tables]]`)
and adds native date/time types. JSON Schema validation operates on the parsed
value tree, so date/time values are validated as strings.

## User Stories

- As a developer using TOML for project configuration (e.g. `Cargo.toml`,
  `pyproject.toml`, custom app config), I want to validate my TOML file against
  a JSON Schema so I catch structural errors early without leaving VS Code.
- As a team member, I want to run "Generate Schema from This File" on a TOML
  data file and get a draft JSON Schema I can refine and share.
- As a TOML author, I want the status bar to show which schema is bound to my
  open `.toml` file, and be able to bind one with the same **Bind Schema…**
  command I use for JSON and YAML files.

## Functional Requirements

### Language Registration

- **F11-FR-01** The extension MUST add `onLanguage:toml` to its activation
  events in `package.json` so it activates when a TOML file is opened.
- **F11-FR-02** `languages.ts` MUST add a `TOML_LANGS = ['toml']` constant and
  include it in `ALL_LANGS` so all `isSupported()` checks handle TOML without
  per-call changes.
- **F11-FR-03** A new exported function `isToml(languageId: string): boolean`
  MUST be added to `languages.ts`.
- **F11-FR-04** A new exported function `parseToml(text: string): unknown` MUST
  be added to `languages.ts`. It MUST use a pure-JS TOML parser from npm (see
  Non-Functional Requirements) and MUST throw on invalid TOML.

### TOML Parser Dependency

- **F11-FR-05** The project MUST add `smol-toml` as a production dependency.
  It is pure TypeScript (~15 KB), dual ESM/CJS (compatible with the VS Code
  extension host's CommonJS runtime), MIT-licensed, and actively maintained
  with no native bindings.

### Validation

- **F11-FR-06** `ValidationManager` MUST parse TOML documents using `parseToml`
  before passing the resulting value to Ajv, consistent with how YAML uses
  `YAML.parse` and JSONL uses `parseJsonl`.
- **F11-FR-07** The "Validation supports…" information message MUST be updated
  to include TOML.
- **F11-FR-08** Validation errors MUST use `locateInDocument` with the existing
  `instancePath`-to-range logic. Because TOML key syntax differs from JSON, the
  locator will match bare key names (e.g. `name`) using the same regex heuristic
  already applied for JSON/YAML; exact column accuracy is not required for this
  first version.

### Schema Inference

- **F11-FR-09** The `jsonschema.inferSchema` command MUST parse TOML files using
  `parseToml` and pass the result to `genson-js`, producing a draft JSON Schema
  in a new untitled editor — identical behaviour to JSON and YAML inference.
- **F11-FR-10** TOML native date/time values (parsed as JavaScript `Date`
  objects by the chosen library) MUST be converted to ISO-8601 strings before
  being passed to `genson-js`, so they are inferred as `{ type: "string" }`
  rather than causing inference errors.

### Schema Binding

- **F11-FR-11** The status bar item MUST be visible when a TOML file is the
  active editor (consistent with F04-FR-05). It reflects whatever
  `extractInlineSchemaUrl` returns for the file.
- **F11-FR-12** The **Bind Schema…** command MUST be available for TOML files.
  For TOML the scope picker MUST offer **Inline (this file)** only — no
  folder/workspace/user settings options — because VS Code has no built-in
  `toml.schemas` mechanism and writing to third-party extension settings is
  out of scope. The picker MUST show an explanatory subtitle:
  *"TOML binding is inline only — the $schema key is written into your file."*
- **F11-FR-13** The extension MUST NOT write to `json.schemas`, `yaml.schemas`,
  or any setting owned by a third-party TOML extension.

### Inline `$schema` for TOML (extends F10)

- **F11-FR-15** `extractInlineSchemaUrl` MUST be extended to detect TOML
  files and extract the `"$schema"` key value using a lightweight regex
  (`/^"\$schema"\s*=\s*"([^"]+)"/m`) rather than full TOML parsing, consistent
  with how YAML inline extraction uses a regex.
- **F11-FR-16** The F10 inline binding write path MUST support TOML: inserting
  or replacing `"$schema" = "<ref>"` as the first non-comment line of the file,
  using a `WorkspaceEdit`.
- **F11-FR-17** Inline removal for TOML MUST delete the `"$schema" = ...` line
  entirely (TOML key–value pairs are self-contained lines; no trailing-comma
  repair is needed unlike JSON).

### Menus and Command Palette

- **F11-FR-18** All editor/title and editor/context menu `when` clauses that
  currently list `resourceLangId == json || ... || resourceLangId == yml` MUST
  be extended to include `resourceLangId == toml` where the command is relevant
  to data files (validate, infer, bind).
- **F11-FR-19** TOML files MUST NOT trigger the preview, visual-editor, or
  configure-preview commands, as those operate on JSON Schema files only.

## Non-Functional Requirements

- **F11-NFR-01** `parseToml` MUST be synchronous and MUST NOT spawn a
  subprocess, consistent with Article III.1 — the TOML parser runs in the
  extension host on already-loaded document text.
- **F11-NFR-02** The chosen TOML library's bundle size MUST be evaluated; if
  it adds more than ~50 KB to the packaged `.vsix`, the team should consider
  lazy `require()` at first use.
- **F11-NFR-03** All new code paths in `languages.ts` MUST be covered by unit
  tests (≥ 80 % on all axes), consistent with Article V.

## Out of Scope

- Rendering HTML documentation for TOML Schema files — TOML is a data format,
  not a schema format; `json-schema-for-humans` operates on JSON Schema files
  only.
- Visual schema editing for TOML files.
- Supporting TOML Schema (an experimental schema format for TOML) — this spec
  covers JSON Schema validation of TOML data only.
- Live preview updates for TOML (live-update is schema-preview specific, F02).
- Full TOML-aware error location (exact column ranges for validation errors
  require a TOML AST; deferred to a follow-up spec).

## Acceptance Criteria

1. Opening `config.toml` activates the extension and shows the status bar item.
2. Running **Validate This File** on a valid TOML file against a matching schema
   shows "✓ config.toml is valid".
3. Running **Validate This File** on an invalid TOML file shows validation errors
   in the Problems panel.
4. Running **Generate Schema from This File** on `config.toml` opens a new JSON
   editor with an inferred schema.
5. Running **Bind Schema…** on `config.toml` shows only the **Inline** scope
   option with the explanatory subtitle; choosing it inserts
   `"$schema" = "./schemas/config.schema.json"` as the first line.
6. After inline binding the status bar shows
   `$(file-symlink-file) Schema: config.schema.json`.
7. Running **Remove** via **Bind Schema…** on the same file strips the
   `"$schema" = ...` line and the file parses cleanly as TOML.
8. A TOML file containing TOML native dates validates without errors (dates
   treated as strings).
9. The "Validate", "Generate Schema", and "Bind Schema…" commands do NOT appear
   for `.toml` files in the Preview / Edit Schema menu group.

## Open Questions

All questions resolved — no open items.

<!-- Resolved questions (for audit trail):

Q1 — TOML parser library [resolved by user]
  Decision: use `smol-toml`. Pure TypeScript, ~15 KB, dual ESM/CJS, MIT,
  actively maintained. See F11-FR-05.

Q2 — Settings-based binding when no TOML extension installed [resolved by user]
  Decision: no settings-based binding for TOML at all. Inline `"$schema"` is
  the sole binding mechanism. This avoids any coupling to or conflict with
  third-party TOML extensions. The scope picker shows Inline only for TOML
  files. See F11-FR-12, F11-FR-14.
-->

## Relation to Existing Specs

- Extends **F03** (validation) — new `isToml` branch in the parse step;
  no changes to Ajv compilation.
- Extends **F04** (binding) — status bar mechanic only; no new settings
  target. TOML schema is resolved exclusively via `extractInlineSchemaUrl`.
- Extends **F06** (inference) — new `isToml` parse branch; same `genson-js`
  call.
- Extends **F10** (inline binding) — TOML write/remove path added; F10-FR-15
  through F10-FR-17 are owned here to keep TOML concerns in one spec.
- **S01** (security): `parseToml` processes workspace file content; no HTML
  involved, no `eval`, consistent with existing parsers.
- **S02** (workspace trust): TOML validation and file mutation (inline binding)
  MUST be blocked in untrusted workspaces, same as all other data-file
  operations.
- **S03** (performance): TOML parsing is synchronous and in-process; no timeout
  needed. Binding writes remain async (VS Code config API).
- Requires **constitution amendment** to add `TOML parsing: smol-toml` to
  Article II's technology table.
