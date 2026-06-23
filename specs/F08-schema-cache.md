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
