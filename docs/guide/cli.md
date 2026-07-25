<!-- spec:F27 start -->
# Command-Line Interface

Every non-preview capability of this project — validation, linting, diff,
bundling, and draft migration — lives in pure, editor-independent modules. The
**`json-schema-toolkit`** (command `jstk`) CLI is a second front end over that same core, so you
can run the exact engine the VS Code extension uses in CI, pre-commit hooks, or
any terminal. No VS Code, no Python.

It is published as its own npm package and reuses the extension's core directly,
so a fix in the engine fixes both front ends — the CLI never forks the logic.

## Install

```sh
npm install -g json-schema-toolkit
# or, without installing:
npx json-schema-toolkit --help
```

## Commands

### `validate <data-file> --schema <schema>`

Validate a JSON / JSONC / JSONL / YAML / TOML data file against a schema, using
the same draft-aware Ajv pipeline as the editor. Exits `0` when valid, `1` when
there is at least one violation (each printed with its line when locatable).

```sh
jstk validate config.yaml --schema config.schema.json
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
jstk diff api.v1.json api.v2.json --check --strict
```

### `bundle <schema-file>`

Resolve external `$ref`s — from the filesystem or over HTTP — into one
self-contained schema, collected under `$defs`. `--dereference` inlines the
targets instead. Each embedded `$defs` entry records its source in a
`$comment` (`Bundled from <id>`), so `graph` can still show where it came from
after flattening.

```sh
jstk bundle api/root.schema.json > api.bundled.json
```

### `migrate <schema-file> --to <draft>`

Convert a schema between drafts (`2020-12`, `2019-09`, `draft-07`). The migrated
schema is written to stdout and the list of changes to stderr, so stdout stays a
clean, pipeable schema.

```sh
jstk migrate legacy.schema.json --to 2020-12 > modern.schema.json
```

### `infer <data-file> [--to <draft>]`

Infer a schema from an existing data file (JSON/JSONC/JSONL/YAML/TOML). A JSONL
file infers over the array of its records. `--to` selects the declared
meta-schema (`2020-12`, `2019-09`, `draft-07`) and defaults to `2020-12`, the
latest draft.

```sh
jstk infer config.json > config.schema.json
jstk infer config.json --to draft-07 > config.schema.json
```

### `sample <schema-file>`

Generate a valid sample instance from a schema, resolving same-document `$ref`s.
If the schema is unsatisfiable, it reports the failing keyword(s) and exits with
the data-error code rather than emitting an invalid document.

```sh
jstk sample config.schema.json
```

### `types <schema-file> [--lang <id>]`

Generate typed source from a schema. External `$ref`s are bundled first, so the
generator runs on a self-contained document. `--lang` selects the target
(`typescript` — the default — `python`, `go`, `rust`, `java`, `csharp`,
`kotlin`, `swift`, `dart`, `cpp`).

```sh
jstk types api.schema.json --lang go > api.go
```

### `coverage <data-file...> --schema <schema>`

Report which of a schema's declared properties the data actually exercises —
a quick way to spot fields your fixtures never touch. Accepts one or more data
files of any supported format (including JSONL); coverage is unioned across
every record of every file.

```sh
jstk coverage sample-data.json --schema api.schema.json
jstk coverage fixtures/*.json events.jsonl --schema api.schema.json
```

### `validate <dir> --workspace`

Scan a directory and validate every data file that carries an inline `$schema`
binding against that schema, printing a grouped Markdown report. Exits `1` if any
file has a validation or binding error.

```sh
jstk validate ./config --workspace
```

### `graph <schema-file> [--svg]`

Print the schema's `$ref` dependency graph — an adjacency list by default, or an
SVG diagram with `--svg`. External and unresolved refs are shown without being
fetched, and cycles are flagged. Each node also shows its `type` and a
truncated `description` when known; a `$defs` entry produced by `bundle`
(carrying a `Bundled from <id>` `$comment`) shows that original source too.

```sh
jstk graph api.schema.json          # adjacency list + summary
jstk graph api.schema.json --svg > api-refs.svg
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
