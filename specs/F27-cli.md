# F27 — Standalone Command-Line Interface

## Overview

Every non-preview capability of this project — validation, linting, diff,
bundling, migration — already lives in **pure, `vscode`-free modules** (a
deliberate architecture principle; see the constitution's Article III and the
`*-NFR` "pure module" requirements throughout `specs/`). Those modules only
have a VS Code *front end* today. This spec adds a second, equally thin front
end: a **standalone CLI** that reuses the exact same core so the tools work in
CI, pre-commit hooks, and any editor-less workflow — without VS Code, and
without duplicating a single line of logic.

The CLI ships as its own npm package so a consumer can `npx` it or install it
globally, independent of the extension. This directly serves the project's
**agnosticity principle**: the value lives in tool-neutral, reusable modules,
and the extension is just one of several possible front ends.

The existing `schema:compat` script (F26) is the proof of concept — a headless
CLI over `schemaDiff` + `schemaCompat`. F27 generalises that pattern into a
first-class, multi-command binary.

## User Stories

- As a platform engineer, I want to validate data files and lint schemas in CI
  without installing VS Code, reusing the same engine my team uses in the editor.
- As a schema author, I want `npx <cli> diff old.json new.json --check` to fail
  a pull request on a breaking change, from any CI provider.
- As a build-tooling author, I want machine-readable (`--json`) output so I can
  wire these checks into my own pipeline.
- As a maintainer, I want the CLI to reuse the extension's pure core so a fix in
  one place fixes both, with no divergence.

## Functional Requirements

### Packaging & invocation

- **F27-FR-01** The CLI MUST be a standalone, publishable npm package with a
  `bin` entry, runnable without VS Code. It MUST NOT re-implement any core
  logic: every subcommand MUST call the same pure modules the extension uses.
- **F27-FR-02** Invoked with no subcommand, `--help`, or `-h`, the CLI MUST
  print usage listing every subcommand and exit `0`. `--version` MUST print the
  CLI package version and exit `0`.
- **F27-FR-03** An unknown subcommand MUST print an error naming it plus the
  usage summary, and exit with the usage-error code (`64`).

### Subcommands

- **F27-FR-04** `validate <data-file> --schema <schema-file>` MUST parse the
  data file by its extension (JSON/JSONC/JSONL/YAML/TOML, reusing F03/F20's
  `parseDataText`), validate it against the schema with the draft-aware Ajv
  pipeline (F03), print each violation with its 1-based line when locatable, and
  exit `0` when valid or `1` when there is at least one violation.
- **F27-FR-05** `lint <schema-file>` MUST run the F17 schema-quality rules and
  print each finding with its rule id and 1-based line. It MUST exit `1` when
  any finding is at `warning` severity, else `0` (so lint can gate CI without
  failing on advisory hints).
- **F27-FR-06** `diff <old-schema> <new-schema>` MUST print the F15 grouped
  change report. With `--check` it MUST additionally compute the F26
  compatibility verdict and adopt F26's exit codes (`0` compatible, `1`
  breaking, `2` strict-mode "unknown"); `--strict` MUST apply F26 strict mode.
- **F27-FR-07** `bundle <schema-file>` MUST produce a single self-contained
  schema (F14) by resolving external `$ref`s, and print it to stdout. Local
  (relative/absolute path) refs MUST be resolved from the filesystem; remote
  (`http(s)`) refs MUST be fetched. `--dereference` MUST inline refs (F14's
  dereference mode) instead of collecting them under `$defs`.
- **F27-FR-08** `migrate <schema-file> --to <2020-12|2019-09|draft-07>` MUST
  transform the schema to the target draft (F22) and print the migrated schema,
  reporting the list of changes to stderr (so stdout stays a clean schema).

### Output & exit codes

- **F27-FR-09** Every subcommand MUST accept `--json`, emitting a
  machine-readable object (result payload + `exitCode`) on stdout instead of the
  human report, for pipeline consumption.
- **F27-FR-10** Exit codes MUST be consistent across subcommands: `0` success /
  clean, `1` a finding or failed check, `2` reserved for `diff --check --strict`
  "unknown", `64` a usage error (bad arguments), `65` a data error (a file that
  cannot be read or parsed). A data or usage error MUST print to stderr and MUST
  NOT be confused with a clean/finding exit.

## Non-Functional Requirements

- **F27-NFR-01** The CLI MUST NOT import the `vscode` module, directly or
  transitively — it depends only on the pure core (agnosticity: the CLI must
  build and run with no editor present). Enforced by the bundle build (a
  `vscode` import would fail to resolve outside the extension host).
- **F27-NFR-02** The CLI's argument parsing, command routing, and report
  formatting MUST live in a pure, `vscode`-free, I/O-injected module
  (`runCli(argv, io)` returning `{ stdout, stderr, code }`) with ≥ 80 %
  unit-test coverage (Article V). Only the thin executable entry point that
  wires real stdio/filesystem/`fetch` and calls `process.exit` may be
  I/O-bound, and it is the CLI's sole coverage-excluded file.
- **F27-NFR-03** The published CLI package MUST be self-contained: its bundle
  MUST inline the core modules it uses so the package has no runtime dependency
  on the extension's build output (`out/` or `dist/extension.js`).

## Acceptance Criteria

1. `node cli/dist/cli.js --help` lists validate, lint, diff, bundle, migrate and
   exits `0`.
2. `validate` against a schema the data violates exits `1` and prints the
   offending path with a line number; against valid data it exits `0`.
3. `diff a.json b.json --check` exits `1` when `b` drops a required-less type or
   otherwise breaks compatibility, matching the extension's verdict.
4. `bundle` on a schema with a relative `$ref` prints one document with the ref
   resolved; running it needs no VS Code.
5. `migrate old.json --to 2020-12` prints a draft-2020-12 schema on stdout and
   the change list on stderr.

## History

- 2026-07-19 — Initial spec: standalone CLI reusing the pure core
  (validate/lint/diff/bundle/migrate), published as its own npm package.
