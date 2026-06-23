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

### Validation Execution

- **F03-FR-04** The command `jsonschema.validateFile` MUST run AJV against the
  resolved schema and the current file's content.
- **F03-FR-05** Validation MUST support JSON, JSONC, JSONL, YAML, and YML file
  formats.
- **F03-FR-06** JSONC files MUST have comments stripped before parsing.
- **F03-FR-07** JSONL files MUST be validated as an array of records (one per line).

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
