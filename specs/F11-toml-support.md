# F11 — TOML File Support

## Overview

Add TOML (`.toml`) as a first-class data format alongside JSON, JSONC, JSONL,
and YAML. TOML files can be validated against a JSON Schema, have a schema
inferred from their contents, and display a bound schema in the status bar.
Because VS Code has no built-in `toml.schemas` setting, settings-based binding
writes to `evenBetterToml.schema.associations` when the
`tamasfe.even-better-toml` extension is installed, or falls back to
extension-managed workspace state. Inline `$schema` binding (F10) is extended
to cover TOML syntax.

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

- **F11-FR-05** The project MUST add exactly one TOML parsing library as a
  production dependency. The chosen library MUST be:
  - Pure JavaScript / TypeScript (no native bindings, no Python subprocess)
  - CommonJS-compatible or dual ESM/CJS (VS Code extension host is CommonJS)
  - Actively maintained with a permissive licence (MIT or ISC)
  - `[NEEDS CLARIFICATION]` — preferred library from the team (candidate:
    `smol-toml`; alternative: `@iarna/toml`).

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
  active editor (consistent with F04-FR-05).
- **F11-FR-12** The **Bind Schema…** command MUST be available for TOML files
  and MUST present the same scope picker used for other formats, with the
  following behaviour per scope:
  - **Inline** — writes `"$schema" = "<ref>"` as the first key in the TOML
    file (see F10; TOML key names containing `$` MUST be quoted per the TOML
    spec).
  - **Settings (folder / workspace / user)** — writes to
    `evenBetterToml.schema.associations` if `tamasfe.even-better-toml` is
    installed; otherwise stores the binding in extension workspace state and
    resolves it internally for validation only.
- **F11-FR-13** When the binding target is `evenBetterToml.schema.associations`
  the association MUST be written as a glob-pattern-to-schema-URL map:
  `{ "<glob>": "<schemaRef>" }`.
- **F11-FR-14** The command MUST NOT offer TOML files the `json.schemas` or
  `yaml.schemas` settings paths, as VS Code's built-in language servers do not
  handle TOML.

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
5. Running **Bind Schema…** on `config.toml` and choosing **Inline** inserts
   `"$schema" = "./schemas/config.schema.json"` as the first line.
6. Running **Bind Schema…** and choosing a settings scope with
   `tamasfe.even-better-toml` installed writes to
   `evenBetterToml.schema.associations` in the appropriate settings file.
7. Running **Bind Schema…** and choosing a settings scope without
   `tamasfe.even-better-toml` stores the binding in extension workspace state
   and the status bar reflects it.
8. A TOML file containing TOML native dates validates without errors (dates
   treated as strings).
9. The "Validate", "Generate Schema", and "Bind Schema…" commands do NOT appear
   for `.toml` files in the Preview / Edit Schema menu group.

## Open Questions

- [ ] [NEEDS CLARIFICATION] Which TOML npm library should be used? Candidates:
  - `smol-toml` — small (~15 KB), pure TypeScript, MIT, dual ESM/CJS, no native
    deps. Actively maintained.
  - `@iarna/toml` — battle-tested, wider adoption, MIT, but ESM-only in v3+
    (may require CJS shim for VS Code extension host).
  - `toml` — simple, tiny, but minimal maintenance activity since 2017.
- [ ] [NEEDS CLARIFICATION] When `tamasfe.even-better-toml` is NOT installed,
  should the scope picker hide the settings-based binding options entirely (with
  a note that only Inline binding is available without the TOML extension), or
  show them with a warning that they will only be used by this extension's own
  validator?

## Relation to Existing Specs

- Extends **F03** (validation) — new `isToml` branch in the parse step;
  no changes to Ajv compilation.
- Extends **F04** (binding) — new settings target
  (`evenBetterToml.schema.associations`); adds workspace-state fallback for
  TOML; same status bar mechanics.
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
- Requires **constitution amendment** to add `TOML parsing: <library>` to
  Article II's technology table.
