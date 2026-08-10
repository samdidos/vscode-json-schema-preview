# F28 — Preview Scroll Sync

## Overview

While a schema's preview panel (F01) is open, scrolling the schema source file
in the editor also scrolls the preview panel to the proportionally equivalent
position, so the two views track each other as the author browses a long
schema. The feature is one-directional (editor drives the preview, not the
reverse) and is separate from F01-FR-17, which restores the preview's *own*
last scroll position after a save-triggered refresh — this spec covers
continuous sync while the editor scrolls, independent of any refresh.

Because rendered output (from `json-schema-for-humans` or the built-in
fallback, F01-FR-21) has no per-line mapping back to the source document, the
sync is proportional rather than exact: the fraction of the editor scrolled
is applied as the same fraction of the preview's scrollable height.

## User Stories

- As a schema author, I want the preview to follow along as I scroll through a
  large schema file, so I don't have to scroll the preview separately to see
  the section I'm editing.
- As a user who finds synced scrolling distracting or inaccurate for their
  schema, I want to turn it off and have the preview stay exactly where I left
  it.

## Functional Requirements

### Setting

- **F28-FR-01** A `jsonschema.preview.syncScroll` boolean setting MUST control
  whether the preview panel's scroll position follows the schema editor's
  scroll position. It MUST default to `true`.

### Sync Behaviour

- **F28-FR-02** When `jsonschema.preview.syncScroll` is `true` and the active
  editor's document is a JSON Schema file (F01-FR-02) with a preview panel
  currently open for it, a change in the editor's visible range MUST scroll
  that preview panel to the proportionally equivalent position: the topmost
  visible line divided by the document's total line count (clamped to
  `[0, 1]`), applied client-side against the preview's own scrollable height
  (`document.body.scrollHeight` minus the viewport height).
- **F28-FR-03** A document with fewer than 2 lines MUST be treated as
  fraction `0` rather than dividing by zero.
- **F28-FR-04** When there is no open preview panel for the scrolled
  document, or the scrolled document is not a JSON Schema file, the extension
  MUST NOT send a scroll message to any panel.

### Disabling

- **F28-FR-05** When `jsonschema.preview.syncScroll` is `false`, editor
  scrolling MUST NOT send any scroll-position message to the preview panel —
  the panel's scroll position is then only affected by the F01-FR-17
  restore-on-refresh behaviour.

### Directionality and Cost

- **F28-FR-06** The sync MUST be one-directional: scrolling the preview panel
  itself MUST NOT change the editor's visible range.
- **F28-FR-07** Sync MUST NOT trigger a preview re-render or re-invoke the
  renderer (F01/F01-FR-21) — it MUST be implemented purely as a
  `webview.postMessage` carrying the target fraction, consumed by a
  client-side `window.scrollTo` in the already-rendered panel.

## Non-Functional Requirements

- **F28-NFR-01** The listener MUST be scoped to editor visible-range changes
  only (no additional timers or polling), so it costs nothing while no
  preview panel is open.

## Acceptance Criteria

1. With a schema's preview panel open and `jsonschema.preview.syncScroll` at
   its default, scrolling to the middle of the schema file in the editor
   moves the preview panel's scroll position to approximately the middle of
   the rendered output.
2. Setting `jsonschema.preview.syncScroll` to `false` and then scrolling the
   editor leaves the preview panel's scroll position unchanged.
3. Scrolling the preview panel directly does not move the editor's viewport.
4. Scrolling an editor for a file that is not a JSON Schema file, or that has
   no open preview panel, sends no message to any panel.
