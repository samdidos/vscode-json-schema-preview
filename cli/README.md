# json-schema-tools

A standalone, editor-free command-line interface for JSON Schema — the same
engine that powers the [**JSON Schema Preview** VS Code
extension](https://github.com/samdidos/vscode-json-schema-preview), packaged so
you can run it in CI, pre-commit hooks, or any terminal. No VS Code required.

It reuses the extension's pure core modules directly (validation, linting,
diff, bundling, migration), so a fix in the engine fixes both front ends — the
CLI never forks the logic.

## Install

```sh
npm install -g json-schema-tools
# or run without installing:
npx json-schema-tools --help
```

## Commands

| Command | What it does |
|---------|--------------|
| `validate <data-file> --schema <schema>` | Validate a JSON/JSONC/JSONL/YAML/TOML data file against a schema (draft-aware Ajv). |
| `lint <schema-file>` | Report schema-quality findings (missing `description`/`$schema`, unknown keywords, duplicate enums, …). |
| `diff <old-schema> <new-schema>` | Show the classified changes between two schemas. Add `--check` to gate on backward-compatibility, `--strict` to also fail on unclassified changes. |
| `bundle <schema-file>` | Resolve external `$ref`s into one self-contained schema (`$defs`). `--dereference` inlines them instead. |
| `migrate <schema-file> --to <draft>` | Convert a schema to `2020-12`, `2019-09`, or `draft-07`. |

Global options: `--json` (machine-readable output), `-h`/`--help`, `-v`/`--version`.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success / clean |
| `1` | A finding, or a failed `diff --check` |
| `2` | `diff --check --strict` — compatibility unknown |
| `64` | Usage error (bad arguments) |
| `65` | Data error (a file that cannot be read or parsed) |

Stable exit codes make every command CI-friendly:

```sh
# Fail the build on a breaking schema change
json-schema-tools diff api.v1.json api.v2.json --check --strict

# Validate every config against its schema
json-schema-tools validate config.yaml --schema config.schema.json
```

## Examples

```sh
# Lint a schema, machine-readable
json-schema-tools lint user.schema.json --json

# Bundle a multi-file schema for publishing
json-schema-tools bundle api/root.schema.json > api.bundled.json

# Migrate a draft-07 schema to 2020-12 (changes are reported on stderr)
json-schema-tools migrate legacy.schema.json --to 2020-12 > modern.schema.json
```

## License

MIT © Samuel Cardinal. Part of the
[json-schema-preview](https://github.com/samdidos/vscode-json-schema-preview)
project.
