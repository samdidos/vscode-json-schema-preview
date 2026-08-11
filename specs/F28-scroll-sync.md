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
baseline sync is proportional rather than exact: the fraction of the editor
scrolled is applied as the same fraction of the preview's scrollable height.

On top of that baseline, the extension attempts **section-accurate** sync:
`json-schema-for-humans`'s default `flat` template (F01-FR-11) assigns each
inlined property an `id` derived from its schema path (property names joined
by `_`, with a literal `items` segment for array items — e.g. a schema's
`properties.address.properties.city` renders as `id="address_city"`; an
array's `items` schema keeps the literal segment, e.g. `id="items_items"`).
The extension computes the same kind of path for the schema source position
being synced and, when an element with a matching id exists in the rendered
page, scrolls directly to it instead of using the proportional fallback.

This only covers the common case — a position that sits directly under
nested `properties`/`patternProperties`/`items` in the *source* document, not
one reached only through `$ref`, `oneOf`/`anyOf`/`allOf`, or
`$defs`/`definitions` indirection (those are dereferenced or restructured by
the renderer in ways this spec does not attempt to reverse), and not a
non-`flat` template or a config that disables ids. Those cases and any other
disagreement between the computed id and the rendered page fall back to the
proportional sync automatically — never an error, never a stuck scroll
position.

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
  `webview.postMessage` carrying the target fraction (and any resolved
  anchor-id candidates, F28-FR-09) consumed client-side in the
  already-rendered panel.

### Section-Accurate Sync (Anchor Ids)

- **F28-FR-08** In addition to a change in the editor's visible range
  (F28-FR-02), a change in the editor's cursor/selection position MUST also
  trigger a sync attempt under the same enablement and applicability rules
  (F28-FR-01/04/05) — this is what makes clicking a line (without
  necessarily scrolling) or jumping to a Ctrl+F match in the editor move the
  preview.
- **F28-FR-09** For a reference position (the topmost visible line for a
  visible-range-triggered sync, or the caret position for a
  selection-triggered sync) in a JSON, JSONC, or YAML schema document, the
  extension MUST compute zero or more anchor-id candidate strings by
  resolving the chain of enclosing `properties`/`patternProperties` keys and
  literal `items` steps that contain that position in the parsed source,
  joining each candidate's segments with `_`, ordered from the deepest
  enclosing candidate to progressively shorter prefixes ending at the
  shallowest (top-level) enclosing property. A position not enclosed by any
  such step (e.g. at the document root) MUST yield an empty candidate list.
- **F28-FR-10** The webview script MUST try each anchor-id candidate (when
  any were computed, F28-FR-09) via `document.getElementById`, in the
  supplied order, and on the first match scroll that element into view
  instead of applying the proportional fraction. When the candidate list is
  empty, or none of its ids match an element in the current page, the script
  MUST fall back to the proportional scroll (F28-FR-02) unchanged.
- **F28-FR-11** The built-in fallback renderer (F01-FR-21) MUST emit an `id`
  attribute on each rendered property row, built from the same
  underscore-joined segment convention as F28-FR-09 restricted to the
  segments it can produce (property name chains through nested
  `properties`; it has no separate array-item section, so it never emits an
  `items` segment), so that section-accurate sync also works against its own
  output.

## Non-Functional Requirements

- **F28-NFR-01** The two listeners (F28-FR-02, F28-FR-08) MUST be the only
  mechanism driving sync — no additional timers or polling — so the feature
  costs nothing while no preview panel is open.
- **F28-NFR-02** Anchor-id computation (F28-FR-09) parses the schema source on
  every triggering event; this MUST be debounced (coalescing rapid
  successive triggers, e.g. continuous mouse-wheel scrolling) so it does not
  re-parse the document on every intermediate event.

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
5. With the built-in renderer (F01-FR-21) active, clicking a line inside a
   nested property's subschema (e.g. `properties.address.properties.city`)
   in the editor — without scrolling — scrolls the preview panel to that
   property's row.
6. Clicking a line reached only through a `$ref` (e.g. inside `$defs`) does
   not throw, does not scroll to a wrong section, and falls back to the
   proportional position.
