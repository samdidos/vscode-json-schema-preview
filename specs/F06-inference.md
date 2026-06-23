# F06 — Schema Inference from Data Files

## Overview

The extension can generate a draft JSON Schema from an existing JSON, JSONC,
JSONL, or YAML data file using the `genson-js` library.

## User Stories

- As a developer starting from existing data, I want to generate a schema
  automatically rather than writing it from scratch.
- As a team lead adopting schema-first workflows, I want a starting schema I
  can refine and commit alongside the data.

## Functional Requirements

### Command

- **F06-FR-01** The command `jsonschema.inferSchema` MUST be available in the
  Command Palette.
- **F06-FR-02** The **Generate Schema** toolbar icon (wand) MUST appear only when
  `jsonschema.isJsonSchema` is `false` (data files, not schema files).

### Parsing

- **F06-FR-03** JSON files MUST be parsed with `JSON.parse`.
- **F06-FR-04** JSONC files MUST have comments stripped before parsing.
- **F06-FR-05** JSONL files MUST be parsed as an array (one JSON object per line).
- **F06-FR-06** YAML / YML files MUST be parsed with the `yaml` package.
- **F06-FR-07** A parse error MUST show an error notification with the error
  message and MUST NOT proceed.

### Generation

- **F06-FR-08** The inferred schema MUST be produced by `genson-js`'s
  `createSchema` function.
- **F06-FR-09** The generated schema MUST include `"$schema": "http://json-schema.org/draft-07/schema#"`.
- **F06-FR-10** The generated schema MUST be pretty-printed (2-space indentation).

### Output

- **F06-FR-11** The generated schema MUST be opened in a new untitled document
  with `languageId: "json"` in `ViewColumn.Beside`.
- **F06-FR-12** A notification MUST inform the user to save and bind the schema
  to use it for validation.

## Acceptance Criteria

1. Running **Generate Schema from This File** on `person-valid.json` opens a new
   editor tab containing valid JSON with a `$schema` field and at least the top-level
   property types inferred from the data.
2. Running the command on a malformed JSON file shows an error notification.
