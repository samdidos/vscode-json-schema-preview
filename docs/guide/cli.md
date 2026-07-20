<!-- spec:F27 start -->
# Command-Line Interface

Every non-preview capability of this project — validation, linting, diff,
bundling, and draft migration — lives in pure, editor-independent modules. The
**`json-schema-tools`** CLI is a second front end over that same core, so you
can run the exact engine the VS Code extension uses in CI, pre-commit hooks, or
any terminal. No VS Code, no Python.

It is published as its own npm package and reuses the extension's core directly,
so a fix in the engine fixes both front ends — the CLI never forks the logic.

## Install

```sh
npm install -g json-schema-tools
# or, without installing:
npx json-schema-tools --help
```

## Commands

### `validate <data-file> --schema <schema>`

Validate a JSON / JSONC / JSONL / YAML / TOML data file against a schema, using
the same draft-aware Ajv pipeline as the editor. Exits `0` when valid, `1` when
there is at least one violation (each printed with its line when locatable).

```sh
json-schema-tools validate config.yaml --schema config.schema.json
```

### `lint <schema-file>`

Report schema-quality findings — missing `description`/`$schema`, unknown
keywords, duplicate enums, and more. Exits `1` only when a finding is at
`warning` severity, so advisory hints don't fail your build.

### `diff <old-schema> <new-schema>`

Show the classified changes between two schema versions. Add `--check` to reduce
them to a backward-compatibility verdict and adopt CI-friendly exit codes; add
`--strict` to also fail on changes the classifier cannot prove safe.

```sh
# Fail the build on a breaking (or, with --strict, unprovable) change
json-schema-tools diff api.v1.json api.v2.json --check --strict
```

### `bundle <schema-file>`

Resolve external `$ref`s — from the filesystem or over HTTP — into one
self-contained schema, collected under `$defs`. `--dereference` inlines the
targets instead.

```sh
json-schema-tools bundle api/root.schema.json > api.bundled.json
```

### `migrate <schema-file> --to <draft>`

Convert a schema between drafts (`2020-12`, `2019-09`, `draft-07`). The migrated
schema is written to stdout and the list of changes to stderr, so stdout stays a
clean, pipeable schema.

```sh
json-schema-tools migrate legacy.schema.json --to 2020-12 > modern.schema.json
```

## Global options & exit codes

`--json` switches any command to machine-readable output. `-h`/`--help` and
`-v`/`--version` behave as usual.

| Code | Meaning |
|------|---------|
| `0` | Success / clean |
| `1` | A finding, or a failed `diff --check` |
| `2` | `diff --check --strict` — compatibility unknown |
| `64` | Usage error (bad arguments) |
| `65` | Data error (a file that cannot be read or parsed) |

These codes are stable across every command, so each one drops straight into a
pipeline step.
<!-- spec:F27 end -->
