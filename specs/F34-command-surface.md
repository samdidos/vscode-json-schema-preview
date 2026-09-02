# F34 — Command Surface & Onboarding

## Overview

The extension contributes over thirty commands across preview, validation,
generation, refactoring and analysis. Each was specified with its own surface,
and the aggregate has outgrown the affordances that carry it: the editor title
bar shows six icons plus an overflow for a schema file, the only way to discover
most features is to scroll the Command Palette, there are no default
keybindings, and a first-time user who installs from the Marketplace is shown
nothing at all.

This spec is about the surface rather than any single feature: an onboarding
walkthrough, keybindings for the few commands used often enough to deserve one,
and a grouped menu so the title bar stays legible as the command set grows.

## User Stories

- As a new user, I want the extension to show me what it does after install,
  so I don't have to read a README to find the preview.
- As a daily user, I want a keystroke for Preview and Validate rather than
  re-typing them in the palette.
- As someone with a schema open, I want the extension's commands grouped under
  one menu instead of six icons competing with the editor's own.

## Functional Requirements

### Onboarding

- **F34-FR-01** The extension MUST contribute a **walkthrough** shown on first
  install, with steps covering: previewing a schema, binding and validating a
  data file, generating a schema from existing data, and (as the differentiator
  most users don't know exists) authenticating a private schema.
- **F34-FR-02** Each step MUST have a completion condition tied to an observable
  event — the command having been run, or the relevant context key becoming true
  — so the walkthrough reflects what the user has actually done rather than only
  what they have clicked.
- **F34-FR-03** Each step MUST link to the corresponding docs-site page, so the
  walkthrough is an index into the documentation rather than a second copy of it.

### Keybindings

- **F34-FR-04** The extension MUST contribute default keybindings for the two
  highest-frequency commands: **Preview** (`Ctrl+K V` / `Cmd+K V`, matching the
  editor's own Markdown preview chord) and **Validate This File**
  (`Ctrl+K J` / `Cmd+K J`).
- **F34-FR-05** Every keybinding MUST carry a `when` clause restricting it to
  the file kind it applies to (a schema for Preview, a supported data file for
  Validate), so the chord is free for other extensions everywhere else.

### Menus

- **F34-FR-06** The editor title bar MUST show at most three of the extension's
  icons for any file kind; every other command MUST live under a single
  **JSON Schema** submenu in the title-bar overflow.
- **F34-FR-07** The submenu MUST group commands by purpose — view, generate,
  transform, analyse — using menu groups, so its order is stable and meaningful
  rather than registration-ordered.
- **F34-FR-08** The editor context menu MUST offer the commands that apply to
  the file under the cursor, so the feature set is reachable without the palette
  for users who work from the right-click menu.
- **F34-FR-09** Command Palette visibility MUST remain filtered by file kind, so
  a command that cannot apply to the active editor is not offered there.

### Detection

- **F34-FR-10** A file MUST be recognised as a schema when it declares a
  JSON Schema meta-`$schema` (F01-FR-02), **or** when its name matches a
  conventional schema pattern (`*.schema.json`, `*.schema.yaml`, `*.schema.yml`,
  `schema.json`), **or** when its root object declares schema-defining keywords
  (`$defs`/`definitions` with `properties`, or `properties` with `type:
  "object"`) and it is not itself bound to a schema. This is what makes the
  toolbar, linter and quick fixes available on a new schema file *before* it has
  a `$schema` line — which is exactly when the "insert `$schema`" fix (F17) is
  most useful.
- **F34-FR-11** The structural heuristic MUST NOT classify a data file as a
  schema: a document whose `$schema` points at a non-meta schema (an inline
  binding, F10) MUST always be treated as data, regardless of its shape or name.

## Non-Functional Requirements

- **F34-NFR-01** The detection predicate MUST remain pure and unit-tested, and
  its extension MUST NOT regress any existing F01/F10 classification: the
  meta-`$schema` and inline-binding rules keep precedence over both new signals.
- **F34-NFR-02** Menu and keybinding contributions are manifest-only and MUST be
  asserted by the manifest tests, since they have no runtime code path.
- **F34-NFR-03** The walkthrough MUST NOT run code on activation; it is a
  declarative contribution and MUST NOT add to activation cost (S03).

## Out of Scope

- Localisation of command titles and walkthrough copy.
- A custom side-bar view container. The outline (F31) reuses the editor's own
  Outline view precisely to avoid one.
- Rebinding or hiding commands per user — that is the editor's own
  keybindings/menus customisation, not something to reimplement.

## Acceptance Criteria

1. A fresh install shows the walkthrough, and its preview step completes after
   the preview command runs.
2. `Ctrl+K V` opens the preview on a schema file and does nothing on an
   unrelated file.
3. A schema file's title bar shows three icons; the remaining commands are under
   one JSON Schema submenu.
4. A new `order.schema.json` with `properties` but no `$schema` line shows the
   schema toolbar and offers the insert-`$schema` fix.
5. A data file whose `$schema` points at `./order.schema.json` is never treated
   as a schema, whatever its name.

## Relation to Existing Specs

- **F01 (preview)** owns the meta-`$schema` detection this spec widens
  (F34-FR-10) while preserving its precedence.
- **F10 (inline binding)** supplies the rule that keeps bound data files data.
- **F17 (linting)** is the main beneficiary of earlier detection.
- **S06 (accessibility)** — every added affordance is keyboard-reachable and
  labelled, as all contributions here are native VS Code surfaces.

## History

- **2026-09-02** — Initial specification.
