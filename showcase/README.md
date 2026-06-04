# Showcase

This directory contains handcrafted sample files for manually testing and demonstrating the extension's core features. Use them in conjunction with the extension loaded in the Extension Development Host (`F5`).

## Structure

```
showcase/
├── schemas/
│   ├── person.schema.json       # JSON Schema (draft-07) for a person record
│   └── bookshelf.schema.yaml    # YAML Schema (draft-07) for a bookshelf
└── data/
    ├── person-valid.json        # Passes validation against person schema
    ├── person-invalid.json      # Fails validation with multiple errors
    ├── bookshelf.yaml           # Valid bookshelf data (YAML format)
    └── raw-events.jsonc         # JSONC data — good for schema inference
```

## Feature checklist

### Preview (HTML rendering)

Open `schemas/person.schema.json` or `schemas/bookshelf.schema.yaml` and click the **Preview** button in the editor toolbar (or run `JSON Schema: Preview` from the command palette). The schema should render as styled HTML documentation in a side panel.

### Visual editor

Open either schema file and click the **Edit** button in the toolbar (`JSON Schema: Edit (visual)`). A form-based editor should open, letting you modify the schema fields without writing JSON/YAML by hand. Save via the **Save** button and check that the file on disk updates.

### Schema binding

Open `data/person-valid.json` and run `JSON Schema: Bind Schema to This File` (status bar item or command palette). Pick `person.schema.json` from the picker. The status bar should update to show the bound schema name. Repeat for `data/bookshelf.yaml` and `schemas/bookshelf.schema.yaml`.

### Validation

After binding a schema, open the data file and click the **Validate** toolbar button (`JSON Schema: Validate This File`).

- `person-valid.json` — should produce **zero** diagnostic errors.
- `person-invalid.json` — should produce **several** diagnostic errors with precise locations (wrong types, missing required fields, invalid enum values).
- `bookshelf.yaml` — should produce **zero** errors.

### Schema inference

Open `data/raw-events.jsonc` and click the **Generate Schema** toolbar button (`JSON Schema: Generate Schema from This File`). A new untitled JSON file should appear beside the editor with an inferred schema matching the event shape. Save it and bind it to the JSONC file to test round-trip validation.

### Auto-preview and live update

Enable `jsonschema.preview.autoOpen` and `jsonschema.preview.liveUpdate` in your settings, then open a schema file. The preview should open automatically and refresh as you type (subject to the `liveUpdateDelay` debounce).

## Adding new samples

Place new schema files in `schemas/` and corresponding data files in `data/`. Schema files must contain a top-level `$schema` field so the extension can recognise them. Data files paired with a schema should be bound via the `Bind Schema` command rather than checked in with `.vscode/settings.json` entries, to keep the workspace settings clean.
