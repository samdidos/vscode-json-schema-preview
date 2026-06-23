# F05 — Visual Form-Based Schema Editor

## Overview

The extension provides a webview panel that renders a json-editor form for the
most common JSON Schema keywords. Users can edit schema properties visually and
save back to the source file without touching raw JSON.

## User Stories

- As a non-developer, I want to edit a schema using form fields instead of raw JSON.
- As a developer, I want a quick way to adjust `required`, `description`, and enum
  values without navigating deep JSON structures.

## Functional Requirements

### Opening

- **F05-FR-01** The command `jsonschema.edit` MUST open the visual editor panel
  in `ViewColumn.Two`.
- **F05-FR-02** The toolbar **Edit** icon (pencil) MUST be visible only when
  `jsonschema.isJsonSchema` is `true`.
- **F05-FR-03** The panel title MUST indicate the schema filename being edited.

### Form Rendering

- **F05-FR-04** The panel MUST render a `json-editor` form pre-populated with
  the current content of the schema file.
- **F05-FR-05** The form MUST cover at minimum: `title`, `description`, `type`,
  `properties`, `required`, `enum`, and numeric constraints (`minimum`, `maximum`).

### Save

- **F05-FR-06** A **Save** button MUST be visible in a sticky bar at the bottom
  of the form.
- **F05-FR-07** Clicking Save MUST write the form's current value back to the
  source schema file on disk.
- **F05-FR-08** After a successful save the preview panel for the same file
  (if open) MUST refresh.

### Security

- **F05-FR-09** All webview scripts MUST be gated with a nonce-based CSP
  (see S01).

## Acceptance Criteria

1. Opening `person.schema.json` and clicking the Edit (pencil) icon shows a form
   with fields for `title`, `description`, and the schema's properties.
2. Changing the `title` field and clicking Save updates the file on disk.
