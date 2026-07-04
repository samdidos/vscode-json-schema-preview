# S06 — Accessibility

## Overview

The extension surfaces two custom webviews (the schema preview and the visual
editor) and several status-bar / notification affordances. Webviews render
outside VS Code's own accessible widgets, so their accessibility is the
extension's responsibility. These requirements set a floor for keyboard
operability and screen-reader support.

**Decision (2026-07-04):** accessibility is specced now, before the surface
grows, because retrofitting it into webview markup later is expensive.

## Requirements

### Keyboard Operability

- **S06-SR-01** Every interactive control the extension injects into a webview
  (e.g. the preview **Download** button) MUST be reachable and operable by
  keyboard alone — it MUST be a natively focusable element (`<button>`,
  `<a href>`) or carry an explicit `tabindex`, and MUST activate on both
  `Enter` and `Space` where the native element does not already.
- **S06-SR-02** The extension MUST NOT trap keyboard focus inside a webview;
  standard VS Code focus-cycling (`F6`, `Tab`) MUST continue to work.

### Screen Reader Semantics

- **S06-SR-03** Injected interactive controls MUST expose an accessible name
  (visible text, `aria-label`, or `title`) so assistive technology can
  announce them. Icon-only controls MUST carry an `aria-label`.
- **S06-SR-04** The fallback renderer (see F01) MUST emit a single top-level
  `<h1>` for the schema title and use semantic heading levels for nested
  sections, so the document is navigable by screen-reader heading commands.
- **S06-SR-05** Decorative glyphs (e.g. the `↓` on the Download button) MUST
  NOT be the control's only accessible name; a text label or `aria-label`
  MUST accompany them.

### Contrast and Motion

- **S06-SR-06** Text the extension renders in its own pages (loading page,
  error page, fallback renderer) SHOULD meet WCAG 2.1 AA contrast (≥ 4.5:1 for
  body text) against its background in both light and dark themes.
- **S06-SR-07** The extension MUST NOT rely on colour alone to convey state
  (e.g. validation errors); a text label or icon MUST accompany any colour cue.

## Acceptance Criteria

1. With the preview open, pressing `Tab` moves focus to the Download button and
   `Enter`/`Space` triggers the save dialog, with no mouse involved.
2. A screen reader announces the Download button by an accessible name, not
   just "button".
3. The fallback-rendered page exposes the schema title as an `<h1>` and nested
   property groups as lower-level headings.
