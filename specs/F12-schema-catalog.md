# F12 — Schema Catalog & Registry Binding

## Overview

Extend **Bind Schema…** (F04) with a searchable catalog picker so users can
discover schemas instead of pasting URLs. Two catalog sources are supported:
the public [SchemaStore.org](https://www.schemastore.org) catalog, and
user-configured private catalogs served from any HTTPS endpoint in the same
catalog format — fetched through the existing authentication (F07) and
timeout/caching (F08) machinery. This deepens the extension's core
differentiator: frictionless work with private schemas.

## User Stories

- As a developer, I want to search a catalog of well-known schemas when binding
  a data file, so I don't have to hunt for the right URL myself.
- As a platform engineer, I want to publish a catalog of my company's internal
  schemas behind our SSO/Artifactory, so teammates can bind them from a picker
  using the credentials they already configured in this extension.
- As a data-file author, I want the picker to suggest catalog schemas whose
  `fileMatch` patterns match my file, so the likely schema is one keystroke
  away.

## Functional Requirements

### Entry Point

- **F12-FR-01** The **Bind Schema…** flow MUST offer a **Browse catalog…**
  option alongside the existing URL/file entry methods.
- **F12-FR-02** Selecting a catalog entry MUST continue into the existing F04
  scope picker (workspace file / folder / user / inline per F10) unchanged —
  the catalog only supplies the schema reference.

### Catalog Sources

- **F12-FR-03** The public SchemaStore catalog
  (`https://www.schemastore.org/api/json/catalog.json`) MUST be available as a
  built-in source, and MUST be individually disableable via a setting
  (`jsonschema.catalog.useSchemaStore`, default `true`).
- **F12-FR-04** A setting `jsonschema.catalog.sources` (array of URLs, default
  `[]`) MUST allow additional catalogs in the SchemaStore catalog JSON format
  (`{ "schemas": [{ "name", "description", "url", "fileMatch" }] }`).
- **F12-FR-05** Catalog fetches MUST go through the shared remote-fetch path:
  stored credentials from F07 are applied per host, and the
  `jsonschema.remoteFetchTimeout` setting applies.
- **F12-FR-06** A catalog response MUST be shape-validated before use;
  malformed entries MUST be skipped (not fatal), and a catalog that fails to
  parse entirely MUST surface one non-modal warning naming the source URL.

### Picker Behaviour

- **F12-FR-07** The picker MUST be a QuickPick filterable by schema `name` and
  `description`, showing the source catalog and URL as item detail.
- **F12-FR-08** Entries whose `fileMatch` glob matches the data file being
  bound SHOULD be ranked first under a "Suggested for this file" separator.
- **F12-FR-09** Binding a catalog schema that requires authentication MUST
  reuse the existing F07 discovery paths (401/403 → *Configure Auth* offer)
  unchanged.

### Catalog Caching

- **F12-FR-10** Fetched catalogs MUST be cached in global storage with a
  24-hour TTL; opening the picker within the TTL MUST NOT hit the network.
- **F12-FR-11** When a catalog fetch fails and a cached copy exists, the picker
  MUST fall back to the cached copy and indicate staleness in the QuickPick
  title (consistent with the S04 stale-cache principle).

## Non-Functional Requirements

- **F12-NFR-01** Catalog fetching MUST be asynchronous and MUST NOT block the
  QuickPick from opening (show a busy indicator while loading).
- **F12-NFR-02** No telemetry: catalog queries and selections MUST NOT be
  reported anywhere (S05).
- **F12-NFR-03** Catalog parsing/matching logic MUST live in a plain module
  unit-testable via the `vscode` mock (≥ 80 % coverage, Article V).

## Out of Scope

- Protocol-specific registries (Confluent Schema Registry, Apicurio,
  AWS Glue) — a follow-up spec can add adapters; this spec covers the
  SchemaStore catalog *format* only.
- Automatic (prompt-less) binding based on `fileMatch` — suggestions require
  an explicit user selection.
- Publishing/pushing schemas to a registry.

## Acceptance Criteria

1. **Bind Schema…** → **Browse catalog…** lists SchemaStore entries and
   filtering by name narrows the list.
2. Adding a private catalog URL to `jsonschema.catalog.sources` whose host has
   stored credentials shows its entries in the same picker.
3. Binding `.github/workflows/x.yml` shows GitHub Actions schemas under
   "Suggested for this file".
4. With the network unplugged and a previously fetched catalog, the picker
   still opens from cache and the title indicates stale data.
5. Selecting an entry continues into the normal scope picker and produces the
   same binding as pasting the URL manually.

## Open Questions

- Q1 — Should `fileMatch` suggestion also surface as a code action on unbound
  data files ("Bind suggested schema …")? Leaning yes, as a follow-up FR.

## Relation to Existing Specs

- Extends **F04** (binding) — new entry method; scope handling unchanged.
- Reuses **F07** (auth) for private catalog and schema fetches.
- Reuses **F08** (cache) storage conventions and **S04** stale-fallback.
- **S01/S05**: catalog data is rendered only in native QuickPicks (no webview
  HTML); no data leaves the machine beyond the catalog HTTP requests.
