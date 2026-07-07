# F08 — Local Schema Cache

## Overview

The extension can download an authenticated remote schema and save it as a local
file, then rewrite the VS Code `json.schemas` / `yaml.schemas` entry to point at
the local copy. This eliminates IntelliSense red squiggles caused by the language
server's inability to fetch authenticated endpoints.

## User Stories

- As a developer, I want to cache a private schema locally so VS Code's language
  server uses it for IntelliSense without needing my credentials.
- As a developer, I want to refresh the local cache when the remote schema changes.

## Functional Requirements

### Download and Store

- **F08-FR-01** The command `jsonschema.cacheSchemaLocally` MUST download the
  schema from its remote URL using stored authentication credentials.
- **F08-FR-02** The downloaded schema MUST be written to a stable local path
  managed by the extension (within the extension's global storage directory).
- **F08-FR-03** The extension MUST record a mapping from the local path back to
  the original remote URL so the cache can be refreshed.
- **F08-FR-04** Download MUST be performed under a progress notification showing
  the host being fetched.

### Redirect

- **F08-FR-05** After a successful download the binding for the data file MUST be
  updated to point at the local path instead of the remote URL.
- **F08-FR-06** A success notification MUST confirm the cache location and
  instruct the user that the language server will now use the local copy.

### Already Cached

- **F08-FR-07** Running `jsonschema.cacheSchemaLocally` on a file whose schema is
  already cached MUST show an informational message and offer **Refresh Schema
  Cache** instead of re-downloading.

### Refresh

- **F08-FR-08** The command `jsonschema.refreshSchemaCache` MUST re-download the
  schema from the recorded original URL and overwrite the local cache file.
- **F08-FR-09** A progress notification MUST be shown during refresh.
- **F08-FR-10** If no cached schema is found for the active file the command MUST
  show an informational message.

### Freshness — Automatic Revalidation (planned)

- **F08-FR-14** A setting `jsonschema.cache.autoRefresh` MUST control automatic
  cache revalidation with the values `off` (default), `onOpen` (revalidate a
  cached schema when a data file bound to it becomes the active editor, at most
  once per session per schema), and `daily` (revalidate at most once per
  24 hours per schema, checked lazily on activity).
- **F08-FR-15** When the original response carried an `ETag` or `Last-Modified`
  header, revalidation MUST be conditional (`If-None-Match` /
  `If-Modified-Since`); a `304 Not Modified` response MUST NOT rewrite the
  cache file. Responses without validators fall back to a full re-download.
- **F08-FR-16** The extension MUST persist per-entry cache metadata (`etag`,
  `lastModified`, `fetchedAt`) alongside the existing URL mapping so
  conditional requests survive VS Code restarts.
- **F08-FR-17** A failed automatic revalidation MUST be silent — no modal or
  toast; the stale cached copy remains in use (see S04 stale-cache fallback)
  and the failure MAY be reflected in the schema-auth status bar tooltip.
  Manual **Refresh Schema Cache** keeps its existing error reporting
  (F08-FR-11/12).
- **F08-FR-18** Fetched schema content MUST be validated as parseable (per its
  source format, JSON/JSONC or YAML) and re-serialized to canonical JSON
  before being persisted to the local cache file — the raw network response
  bytes MUST NOT be written to disk directly. Unparseable content MUST NOT be
  cached: `download()` fails with an error (surfaced via F08-FR-11/12's
  existing reporting) and `revalidate()` treats it like any other failure
  (F08-FR-17 — silent, stale copy kept). This prevents ever persisting a
  corrupted/malformed response and breaks the direct network-to-disk data
  flow a security scan flags on an unvalidated write.
- **F08-FR-19** `revalidate()` MUST NOT determine whether a cached copy
  exists via a separate existence check (e.g. `fs.existsSync`) whose result
  is then relied on by a later, distinct file operation — that check-then-use
  split is a TOCTOU race between the check and the (much later, post-network-
  await) write. Existence MUST instead be established by directly attempting
  the real file operation and handling its failure.

### Error Handling

- **F08-FR-11** If the download returns 401/403 an `AuthRequiredError` MUST be
  thrown; the caller MUST offer a **Configure Auth** button.
- **F08-FR-12** Any other download failure MUST show an error notification with
  the error message.

### Fetch Timeout

- **F08-FR-13** Remote fetch requests MUST have a timeout to prevent the UI from
  hanging indefinitely on slow or unreachable endpoints.

## Non-Functional Requirements

- **F08-NFR-01** The local cache MUST survive VS Code restarts.
- **F08-NFR-02** Cached files MUST NOT be committed to source control (they live
  in the extension's global storage, outside the workspace).

## Acceptance Criteria

1. Running **Cache Schema Locally** on a file with a remote `$schema` produces a
   local file and updates the `json.schemas` entry to point at it.
2. Running the command a second time shows "Schema is already cached" and suggests
   Refresh.
3. Running **Refresh Schema Cache** re-downloads the file from the original URL.
4. With `jsonschema.cache.autoRefresh: "onOpen"`, activating a bound data file
   sends a conditional request; on `304` the cache file's mtime is unchanged.
5. With the network unplugged and `autoRefresh` enabled, activating a bound data
   file produces no error UI and validation still uses the cached schema.
