# F19 — TOML Schema IntelliSense

## Overview

F11 made TOML data files validate against a bound schema, but editing
assistance stops there: VS Code's JSON and YAML language servers provide
schema-driven completions and hovers, while TOML has no schema-aware language
server at all. This spec closes that gap for TOML files with an inline
`"$schema"` binding (the only TOML binding form, F11-FR-14): completion of
keys and enum values, and hover documentation, driven by the bound schema.

## User Stories

- As a developer editing a bound TOML config, I want key completions from the
  schema, so I don't have to alt-tab to the schema (or the docs) for names.
- As a developer, I want hovering a key to show the schema's
  `title`/`description`/type, the same way it does in bound JSON files.
- As a schema author distributing a TOML-configured tool, I want users to get
  enum value completions, so invalid values are caught before validation runs.

## Functional Requirements

### Scope & Activation

- **F19-FR-01** A completion provider and a hover provider MUST be registered
  for TOML documents, active only when the document has an inline `$schema`
  binding (F11-FR-15 extraction) that resolves to a loadable schema.
- **F19-FR-02** Schema loading MUST reuse the existing resolution pipeline:
  local paths, cached remote schemas (F08), and authenticated fetches (F07).
  When the schema cannot be loaded the providers MUST return no results —
  never an error toast from a hover.

### Completions

- **F19-FR-03** At a key position, completions MUST offer the schema
  properties valid at the current table path (root keys at the top level;
  properties of the subschema reached by interpreting `[table]` /
  `[[array-of-table]]` headers and dotted keys as a JSON pointer path).
  Already-present keys in the same table MUST be omitted.
- **F19-FR-04** At a value position, completions MUST offer `enum` and `const`
  alternatives and `true`/`false` for booleans, serialised as valid TOML for
  the property's type (quoted strings, bare numbers/booleans).
- **F19-FR-05** Completion items MUST carry the property's `description` as
  documentation and mark schema-`required` properties so they sort first.
- **F19-FR-06** `$ref`s within the schema MUST resolve with F13 semantics
  (local pointer, relative file, cached remote) when computing the subschema
  for a position.

### Hover

- **F19-FR-07** Hovering a key MUST show the resolved subschema's `title`,
  `description`, type, and constraints (enum values, min/max) as Markdown,
  matching the content style of F13's `$ref` hovers.

## Non-Functional Requirements

- **F19-NFR-01** Position→subschema mapping MUST be a pure, unit-testable
  module (text + offset in, pointer path out) with ≥ 80 % coverage
  (Article V); parsing MUST reuse `smol-toml` (F11-NFR) rather than regexes.
- **F19-NFR-02** Providers MUST parse the document at most once per
  version/request and MUST NOT perform network fetches during completion or
  hover — only cache reads (S03, S05).

## Out of Scope

- Schema-aware completions for JSON/YAML (already provided by VS Code and the
  Red Hat YAML extension via the bindings this extension writes).
- Diagnostics-as-you-type beyond F11's existing validation command behaviour.
- Formatting or automatic quoting of keys.

## Acceptance Criteria

1. In a TOML file bound to a schema with `properties: {name, port}` where
   `port` has `enum: [80, 443]`, key completion at the root offers `name` and
   `port` (minus any already present); value completion after `port = `
   offers `80` and `443`.
2. Under `[server.tls]`, key completions come from the
   `server.properties.tls` subschema, not the root.
3. Hovering `port` shows its description and enum from the schema.
4. Removing the inline `$schema` line stops completions/hovers.
5. With an unreachable remote schema and an empty cache, providers return
   nothing and show no error UI.

## Relation to Existing Specs

- Builds on **F11** (TOML support, inline-only binding) and its `smol-toml`
  dependency; reuses **F13** ref resolution, **F08** cache, **F07** auth.
- **S03**: single parse per request; **S05**: no network during typing.
