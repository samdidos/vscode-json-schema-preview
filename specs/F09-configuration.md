# F09 — Preview Configuration Panel and File

## Overview

The extension ships a visual configuration panel (a webview) and a raw config
file (`.json-schema-preview-config.json`) that control how `json-schema-for-humans`
renders the preview. The panel writes to the file; the file drives the Python tool.

## User Stories

- As a schema author, I want to switch the preview template to Markdown without
  editing JSON manually.
- As a team, we want to commit a shared config file so all contributors see the
  same rendered output.

## Functional Requirements

### Configure Command

- **F09-FR-01** The command `jsonschema.configure` MUST open the configuration
  panel in `ViewColumn.Two`.
- **F09-FR-02** The configuration toolbar icon (gear) MUST appear only when
  `jsonschema.isJsonSchema` is `true`.
- **F09-FR-03** The panel MUST be pre-populated with the values from the existing
  `.json-schema-preview-config.json` if one is present in the workspace.

### Open Config File Command

- **F09-FR-04** The command `jsonschema.openConfig` MUST open the
  `.json-schema-preview-config.json` file in the editor.
- **F09-FR-05** If no config file exists the command MUST create an empty one
  at the workspace root before opening it.

### Config File Discovery (Multi-Root)

- **F09-FR-06** The config file MUST be searched for starting from the workspace
  folder that contains the active schema file.
- **F09-FR-07** If no config file is found in the schema's folder the extension
  MUST fall back to the other workspace folders in order.
- **F09-FR-08** When no config file is found in any workspace folder the Python
  tool MUST be called with `--config template_name=flat`.

### Saving

- **F09-FR-09** The **Save** button in the configuration panel MUST write the
  panel's current form values to `.json-schema-preview-config.json` in the
  workspace root (or the folder determined by multi-root discovery).
- **F09-FR-10** After saving, the preview panel for any currently open schema
  SHOULD refresh to reflect the new template.

### Security

- **F09-FR-11** The configuration panel webview MUST use a nonce-based CSP
  (see S01).

## Acceptance Criteria

1. Opening the configuration panel shows a form with at least a `template_name`
   selector.
2. Changing `template_name` to `md` and saving writes `{"template_name":"md"}`
   (or similar) to `.json-schema-preview-config.json`.
3. Running **Open Config File** opens the `.json-schema-preview-config.json`
   in the editor.
