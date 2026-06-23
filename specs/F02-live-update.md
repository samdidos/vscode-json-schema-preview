# F02 — Live (Debounced) Preview Updates

## Overview

When `jsonschema.preview.liveUpdate` is enabled, the preview panel refreshes
automatically after the user stops typing, without requiring a file save.

## User Stories

- As a schema author, I want the preview to update while I type so I can see
  my changes immediately.
- As a user on a slow machine, I want to configure the debounce delay so the
  preview does not regenerate on every keystroke.

## Functional Requirements

### Enabling

- **F02-FR-01** Live update MUST only fire when `jsonschema.preview.liveUpdate`
  is `true` in the user's or workspace's settings.
- **F02-FR-02** Live update MUST require the preview panel to already be open;
  it MUST NOT auto-open the panel.
- **F02-FR-03** Live update MUST be silently skipped in untrusted workspaces.

### Debounce

- **F02-FR-04** After each text-document change event for a schema file, the
  extension MUST reset a per-file debounce timer to `jsonschema.preview.liveUpdateDelay`
  milliseconds (minimum 500 ms, default 1500 ms).
- **F02-FR-05** The preview MUST only regenerate when the debounce timer fires
  without being reset (i.e., the user has stopped typing for the configured delay).

### Temporary File

- **F02-FR-06** Live update MUST write the current (unsaved) buffer contents to a
  temporary file and pass that path to `json-schema-for-humans`, so the tool
  reads the in-memory state rather than the on-disk file.
- **F02-FR-07** For JSONC files the extension MUST strip comments before writing
  the temporary file, since `json-schema-for-humans` uses a standard JSON parser.
- **F02-FR-08** The temporary file MUST be deleted after the tool finishes,
  whether the run succeeds or fails.

### Race Condition Handling

- **F02-FR-09** If the preview panel is closed during the debounce delay the
  extension MUST cancel the pending update and not run the Python tool.
- **F02-FR-10** If a new update is requested while the previous one is still
  running, the result of the in-flight run MUST be discarded if the panel has
  been replaced by a newer request before it finishes.

## Acceptance Criteria

1. With `liveUpdate: true` and a preview open, editing a schema field causes the
   preview to refresh after the configured delay without saving.
2. Setting `liveUpdateDelay: 500` causes near-instant refresh; `5000` causes a
   5-second delay.
3. Closing the preview panel and editing the file produces no error.
