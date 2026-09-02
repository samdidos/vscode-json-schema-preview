# json-schema-toolkit

A standalone, editor-free command-line interface for JSON Schema — the same
engine that powers the [**JSON Schema Preview** VS Code
extension](https://github.com/samdidos/vscode-json-schema-preview), packaged so
you can run it in CI, pre-commit hooks, or any terminal. No VS Code required.

The installed command is **`jstk`**.

It reuses the extension's pure core modules directly (validation, linting,
diff, bundling, migration), so a fix in the engine fixes both front ends — the
CLI never forks the logic.

## Install

```sh
npm install -g json-schema-toolkit   # then run:  jstk --help
# or run without installing:
npx json-schema-toolkit --help
```

## Commands

| Command | What it does |
|---------|--------------|
| `validate <data-file> --schema <schema>` | Validate a JSON/JSONC/JSONL/YAML/TOML data file against a schema (draft-aware Ajv). |
| `validate <dir> --workspace` | Validate every data file under a directory that carries an inline `$schema` binding; prints a grouped report. |
| `lint <schema-file>` | Report schema-quality findings (missing `description`/`$schema`, unknown keywords, duplicate enums, …). |
| `diff <old-schema> <new-schema>` | Show the classified changes between two schemas. Add `--check` to gate on backward-compatibility, `--strict` to also fail on unclassified changes. |
| `bundle <schema-file>` | Resolve external `$ref`s into one self-contained schema (`$defs`). `--dereference` inlines them instead. |
| `migrate <schema-file> --to <draft>` | Convert a schema to `2020-12`, `2019-09`, or `draft-07`. |
| `infer <data-file>` | Infer a draft-07 schema from a data file. |
| `sample <schema-file>` | Generate a valid sample instance from a schema. |
| `types <schema-file> [--lang <id>]` | Generate typed source (TypeScript, Python, Go, Rust, Java, C#, Kotlin, Swift, Dart, C++). |
| `coverage <data-file> --schema <schema>` | Report which of a schema's declared properties the data exercises. |
| `graph <schema-file> [--svg]` | Print the `$ref` dependency graph as an adjacency list, or an SVG with `--svg`. |

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
jstk diff api.v1.json api.v2.json --check --strict

# Validate every config against its schema
jstk validate config.yaml --schema config.schema.json
```

## Examples

```sh
# Lint a schema, machine-readable
jstk lint user.schema.json --json

# Bundle a multi-file schema for publishing
jstk bundle api/root.schema.json > api.bundled.json

# Migrate a draft-07 schema to 2020-12 (changes are reported on stderr)
jstk migrate legacy.schema.json --to 2020-12 > modern.schema.json

# Infer a schema from a data file, then generate a sample instance from a schema
jstk infer config.json > config.schema.json
jstk sample config.schema.json

# Generate types, or measure how much of a schema your data exercises
jstk types api.schema.json --lang go > api.go
jstk coverage sample-data.json --schema api.schema.json

# Validate a whole tree, and inspect a schema's $ref structure
jstk validate ./config --workspace
jstk graph api.schema.json          # add --svg for a diagram
```

## License

MIT © Samuel Cardinal. Part of the
[json-schema-preview](https://github.com/samdidos/vscode-json-schema-preview)
project.

## MCP server

`jstk mcp` serves the same tools over the [Model Context Protocol](https://modelcontextprotocol.io)
on stdio, for any agent that speaks it:

```jsonc
{ "mcpServers": { "json-schema": { "command": "npx", "args": ["-y", "json-schema-toolkit", "mcp"] } } }
```

The package carries a `server.json` for the open MCP Registry under the name
`io.github.samdidos/json-schema-toolkit`.
