# F03 — JSON / YAML Validation

## Overview

The extension validates JSON and YAML data files against a JSON Schema using AJV.
Errors are reported as VS Code diagnostics in the Problems panel.

## User Stories

- As a developer, I want to validate a data file against its schema so I can
  catch errors without running the application.
- As a CI engineer, I want validation errors surfaced as Problems so they are
  visible in VS Code's native UX.

## Functional Requirements

### Schema Resolution

- **F03-FR-01** When the active file has an inline `$schema` field the extension
  MUST use that URL/path as the schema without requiring an explicit binding.
- **F03-FR-02** When no inline `$schema` is present the extension MUST look up
  the bound schema via the workspace's `json.schemas` / `yaml.schemas` settings.
- **F03-FR-03** Remote schema URLs MUST be fetched using stored authentication
  credentials when available (see F07).
- **F03-FR-16** When the file has neither an inline `$schema` (F03-FR-01) nor a
  settings binding (F03-FR-02) but VS Code resolves a schema for it **natively**
  (an installed extension's `contributes.jsonValidation`, or a SchemaStore/user
  catalog entry — the same auto state the status bar shows per F04-FR-15), the
  validator MUST use that natively-resolved schema URL rather than report
  "No schema bound". The file is already schema-backed, so validation MUST
  recognise the auto binding and validate against it.
- **F03-FR-17** Validation MAY be re-run automatically when a bound data file is
  saved, governed by `jsonschema.validation.onSave` (default `off`; `bound`
  re-validates a file that already has a resolved binding, `always` also
  re-validates one whose binding resolves natively per F03-FR-16). Automatic
  runs MUST be silent — diagnostics only, no notification — and MUST NOT fetch a
  remote schema that is not already cached (F08), so saving never blocks on the
  network. This closes the gap for YAML, TOML, JSONL and authenticated schemas,
  which VS Code's own language servers do not validate live.

### Validation Execution

- **F03-FR-04** The command `jsonschema.validateFile` MUST run AJV against the
  resolved schema and the current file's content.
- **F03-FR-05** Validation MUST support JSON, JSONC, JSONL, YAML, and YML file
  formats.
- **F03-FR-06** JSONC files MUST have comments stripped before parsing.
- **F03-FR-07** JSONL files MUST be validated as an array of records (one per line).
- **F03-FR-14** A resolved **schema document** MUST be parsed according to its
  own source format, not assumed to be JSON: when the schema path/URL ends in
  `.yaml`/`.yml` it MUST be parsed as YAML (a remote copy is parsed by the
  *original* URL's extension, per F13-FR-06). This keeps the validator
  consistent with the other schema consumers (`SchemaRefProvider`,
  `SchemaBundleCommand`), which already resolve a schema document via
  `languageForSchemaSource` + `parseSchemaText`; loading a YAML-format schema
  MUST NOT fail with a JSON parse error.
- **F03-FR-15** The validator MUST select the AJV dialect matching the
  schema's declared `$schema`: a `$schema` naming JSON Schema **2020-12** MUST
  use `Ajv2020`, one naming **2019-09** MUST use `Ajv2019`, and any other
  value (draft-07/06/04) or an absent `$schema` MUST use the default draft-07
  `Ajv`. This ensures draft-specific keywords — 2020-12's `prefixItems` and
  `$dynamicRef`/`$dynamicAnchor`, and 2019-09/2020-12's `unevaluatedProperties`
  /`unevaluatedItems` — are enforced rather than silently ignored under a
  single draft-07 dialect (`strict: false` otherwise drops unknown keywords
  without error). Draft selection MUST be a pure, unit-testable function of
  the schema's `$schema` string. (This applies to on-demand
  `jsonschema.validateFile`; F16's sample-data self-check deliberately strips
  `$schema` and stays on the default dialect — see F16.)

### Diagnostics

- **F03-FR-08** Each AJV validation error MUST be mapped to a VS Code `Diagnostic`
  with the correct `range` (line and column), `message`, and `source` set to
  `"JSON Schema"`.
- **F03-FR-09** All diagnostics MUST be published to a dedicated
  `DiagnosticCollection` and cleared on the next validation run for the same file.
- **F03-FR-10** When validation passes with no errors the Problems panel MUST show
  zero diagnostics for the file and the extension MUST show a success notification.

### Error Handling

- **F03-FR-11** If the schema cannot be resolved (file not found, HTTP error,
  auth required) the extension MUST show an error message identifying the cause.
- **F03-FR-12** If the auth flow returns 401/403 the error message MUST offer a
  **Configure Auth** button that opens `jsonschema.configureSchemaAuth`.

### Toolbar

- **F03-FR-13** The **Validate** toolbar icon MUST appear only when
  `jsonschema.isJsonSchema` is `false` (i.e. for data files, not schema files).

## Acceptance Criteria

1. Opening `person-invalid.json` (a file that violates its schema) and running
   **Validate This File** produces one or more diagnostics in the Problems panel.
2. Opening `person-valid.json` and validating produces zero diagnostics and a
   success notification.
3. Validation works without an explicit binding when `$schema` is present inline.

## History

- **2026-09-02** — Added F03-FR-17: opt-in re-validation on save
  (`jsonschema.validation.onSave`, default `off`). Automatic runs are silent and
  never fetch an uncached remote schema, so saving is never blocked on the
  network. This closes the live-validation gap for YAML, TOML, JSONL and
  authenticated schemas, which VS Code's own language servers leave open.
