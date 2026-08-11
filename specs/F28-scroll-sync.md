# F28 — Preview Scroll Sync

## Overview

While a schema's preview panel (F01) is open, the editor and the preview
panel keep each other in view as the author browses a long schema:
scrolling (or clicking a line in) the editor moves the preview to the
matching position, and scrolling the preview moves the editor's viewport to
match — a single `jsonschema.preview.syncScroll` setting controls both
directions together. This is separate from F01-FR-17, which restores the
preview's *own* last scroll position after a save-triggered refresh — this
spec covers continuous two-way sync, independent of any refresh.

Because rendered output (from `json-schema-for-humans` or the built-in
fallback, F01-FR-21) has no per-line mapping back to the source document, the
baseline sync is proportional rather than exact: the fraction scrolled on one
side is applied as the same fraction of the other side's scrollable extent
(the preview's content height on the editor→preview leg; the document's line
count on the preview→editor leg).

On top of that baseline, the extension attempts **section-accurate** sync in
both directions using the same anchor-id convention:
`json-schema-for-humans`'s default `flat` template (F01-FR-11) assigns each
inlined property an `id` derived from its schema path (property names joined
by `_`, with a literal `items` segment for array items — e.g. a schema's
`properties.address.properties.city` renders as `id="address_city"`; an
array's `items` schema keeps the literal segment, e.g. `id="items_items"`).
Editor→preview, the extension computes that same kind of path for the
schema source position being synced and scrolls straight to the matching
element when one exists (F28-FR-09/10). Preview→editor, the webview reports
the id of the element nearest the top of its viewport and the extension
resolves it back to a source position (F28-FR-13) — the same convention, run
in reverse.

Both legs fall back to the proportional position when the anchor convention
doesn't apply, which happens for:

- a position reached only through `$ref`, `oneOf`/`anyOf`/`allOf`, or
  `$defs`/`definitions` indirection (dereferenced or restructured by the
  renderer in ways this spec does not attempt to reverse);
- a non-`flat` render template, or a config that disables ids;
- **preview→editor only**: a property whose name itself contains `_` — the
  reverse leg starts from an already-`_`-joined id string with no record of
  where the original segment boundaries were, so it naively splits on every
  `_` and may misread the path for such a name (the editor→preview leg has
  no such gap, since it builds the id from the real segments instead of
  parsing one back apart).

None of these cases are errors: they just fall back to the proportional
position, in either direction.

## User Stories

- As a schema author, I want the preview to follow along as I scroll through a
  large schema file, so I don't have to scroll the preview separately to see
  the section I'm editing.
- As a schema author browsing the *rendered* documentation first, I want
  scrolling the preview to bring the editor to the matching source location,
  so either view can lead.
- As a user who finds synced scrolling distracting or inaccurate for their
  schema, I want to turn it off (in both directions at once) and have each
  view stay exactly where I left it.

## Functional Requirements

### Setting

- **F28-FR-01** A `jsonschema.preview.syncScroll` boolean setting MUST
  control whether the preview panel's scroll position follows the schema
  editor's scroll position **and** whether the editor's viewport follows the
  preview panel's scroll position — one setting gates both directions. It
  MUST default to `true`.

### Sync Behaviour (Editor → Preview)

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

- **F28-FR-05** When `jsonschema.preview.syncScroll` is `false`, neither
  direction MUST send any sync action: editor scrolling MUST NOT send a
  scroll-position message to the preview panel, and preview scrolling MUST
  NOT reveal any range in the editor. The preview panel's scroll position is
  then only affected by the F01-FR-17 restore-on-refresh behaviour.

### Directionality and Cost

- **F28-FR-06** Sync MUST be bidirectional: an editor scroll (F28-FR-02) or
  selection change (F28-FR-08) moves the preview, **and** a preview scroll
  (F28-FR-12) moves the editor's viewport — both gated by the same setting
  (F28-FR-01/05).
- **F28-FR-07** Neither direction MUST trigger a preview re-render or
  re-invoke the renderer (F01/F01-FR-21). Editor→preview MUST be implemented
  purely as a `webview.postMessage` carrying the target fraction (and any
  resolved anchor-id candidates, F28-FR-09) consumed client-side in the
  already-rendered panel; preview→editor MUST be implemented purely as a
  viewport reveal (F28-FR-15) — neither leg reloads or regenerates content.

### Section-Accurate Sync (Anchor Ids) — Editor → Preview

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

### Sync Behaviour (Preview → Editor)

- **F28-FR-12** When `jsonschema.preview.syncScroll` is `true`, scrolling the
  preview panel MUST, once the scroll settles, attempt to move the viewport
  of a visible editor showing the same schema document to the matching
  position: an anchor-id lookup first (F28-FR-13), falling back to the
  proportional position (topmost-visible-preview-element fraction × the
  document's line count, clamped to `[0, document.lineCount - 1]`,
  paralleling F28-FR-02/03) when the anchor doesn't resolve.
- **F28-FR-13** The extension MUST resolve a reported anchor id back to a
  source position by splitting it on `_` into candidate segments and
  reversing the F28-FR-09 convention (a literal `items` segment maps back to
  the `items` keyword; every other segment is looked up as a `properties`
  child — `patternProperties` is not attempted in reverse, since its name
  can't be distinguished from an ordinary property's by the id alone). An
  id that doesn't resolve to a real location in the source (including the
  `_`-ambiguity case in the Overview) MUST fall back to the proportional
  position (F28-FR-12) rather than erroring or leaving the sync attempt
  incomplete.
- **F28-FR-14** When no visible editor shows the scrolled document, or that
  document is not a JSON Schema file, the extension MUST NOT reveal any
  range — this is the preview→editor analogue of F28-FR-04.
- **F28-FR-15** Revealing a position in the editor (F28-FR-12) MUST only
  change the editor's visible range (viewport) — it MUST NOT change the
  editor's selection/cursor position, and MUST NOT make any edit to the
  document.

### Echo Suppression

- **F28-FR-16** Because each direction's sync action itself changes state
  the other direction listens to (a preview scroll reveals a range, which is
  itself a visible-range change; an editor-driven preview scroll fires the
  preview's own scroll event), the extension MUST suppress a sync action
  that is the likely echo of the *opposite* direction's own immediately
  preceding sync action for the same document — tracked per document, with a
  short cooldown window — so the two directions do not oscillate. Two
  consecutive sync actions in the *same* direction (e.g. continued editor
  scrolling) MUST NOT be suppressed by this mechanism; only an
  opposite-direction action within the cooldown window is treated as an
  echo.

## Non-Functional Requirements

- **F28-NFR-01** The event listeners driving both directions (F28-FR-02,
  F28-FR-08, F28-FR-12) MUST be the only mechanism driving sync — no
  additional timers or polling — so the feature costs nothing while no
  preview panel is open.
- **F28-NFR-02** Anchor-id computation (F28-FR-09) parses the schema source on
  every triggering event; this MUST be debounced (coalescing rapid
  successive triggers, e.g. continuous mouse-wheel scrolling) so it does not
  re-parse the document on every intermediate event.
- **F28-NFR-03** The echo-suppression cooldown (F28-FR-16) trades off a
  narrow false positive — two genuinely independent, opposite-direction
  scroll actions within the same short window are treated as one echoed
  action and only the first is applied — for eliminating visible oscillation
  between the editor and the preview; the window MUST be short enough that
  this is imperceptible as "stuck" during normal use.

## Acceptance Criteria

1. With a schema's preview panel open and `jsonschema.preview.syncScroll` at
   its default, scrolling to the middle of the schema file in the editor
   moves the preview panel's scroll position to approximately the middle of
   the rendered output.
2. Setting `jsonschema.preview.syncScroll` to `false` disables both
   directions: scrolling the editor leaves the preview's scroll position
   unchanged, and scrolling the preview leaves the editor's viewport
   unchanged.
3. Scrolling the preview panel to a property's rendered section moves a
   visible editor showing that schema to the matching source line, without
   changing the editor's selection or editing the document.
4. Scrolling an editor for a file that is not a JSON Schema file, or that has
   no open preview panel, sends no message to any panel; scrolling a preview
   panel with no visible editor for its document reveals nothing.
5. With the built-in renderer (F01-FR-21) active, clicking a line inside a
   nested property's subschema (e.g. `properties.address.properties.city`)
   in the editor — without scrolling — scrolls the preview panel to that
   property's row, and scrolling the preview back to that row moves the
   editor back to the matching line.
6. Clicking a line reached only through a `$ref` (e.g. inside `$defs`) does
   not throw, does not scroll to a wrong section, and falls back to the
   proportional position; the same holds in reverse for a preview element
   with no resolvable anchor.
7. Rapidly alternating edits that scroll the editor and then the preview do
   not oscillate or visibly fight each other — the sync settles rather than
   ping-ponging between the two views.
