# F31 — Schema Outline

## Overview

A schema of any size is read by scrolling. VS Code's Outline view and
breadcrumbs — the two affordances that make a large file navigable — show
nothing useful for a JSON Schema, because the built-in JSON symbol provider
reports the *document's* structure (`properties`, then a key, then `type`)
rather than the *schema's* (a property, its type, whether it is required).

This spec contributes a document-symbol provider that reads a schema the way
its author thinks about it: the root, its properties nested by containment,
array element schemas, and the `$defs`/`definitions` block as a sibling
section — each symbol carrying its effective type and required-ness as detail.
That single provider lights up the Outline view, the breadcrumb bar, "Go to
Symbol in Editor" (`Ctrl+Shift+O`), and the sticky-scroll header, at no
additional UI cost.

## User Stories

- As a schema reader, I want an outline of the contract's shape so I can jump to
  a property without scrolling past three levels of `$ref`.
- As a schema author, I want required properties visually distinguished in the
  outline so I can audit the required set at a glance.
- As a reviewer, I want breadcrumbs that say `address → street` rather than
  `properties → address → properties → street`.

## Functional Requirements

- **F31-FR-01** The outline builder MUST produce a tree of symbols from schema
  source text, with the document root as a single top-level symbol named by the
  schema's `title` when present, else the file's base name.
- **F31-FR-02** Each entry under `properties` MUST become a symbol named by the
  property, nested under the symbol of the schema that declares it. Nested
  object schemas MUST nest correspondingly; array element schemas MUST
  contribute their element properties under the array's own symbol.
- **F31-FR-03** A symbol's detail MUST carry the property's effective type as
  rendered by the shared `describeType` helper (F01's fallback renderer), and
  MUST mark required properties distinctly from optional ones.
- **F31-FR-04** A property whose schema is a `$ref` MUST show the reference
  target as its detail rather than an empty type, and MUST NOT be expanded
  in place — following it is F13's job, and expanding would make a recursive
  schema's outline infinite.
- **F31-FR-05** `$defs`/`definitions` MUST appear as one top-level section whose
  children are the definitions, each expanded like any other object schema, so
  a definition-heavy schema is navigable without scrolling to find them.
- **F31-FR-06** Composition keywords (`allOf`/`anyOf`/`oneOf`) MUST contribute
  their branches' properties at the position of the composing schema, so a
  property declared in a branch is reachable from the outline of the object it
  effectively belongs to.
- **F31-FR-07** Every symbol MUST carry a full source span and a selection span
  (the property key), so selecting it reveals the right range.
- **F31-FR-08** Symbol kinds MUST be assigned from the schema's type so the
  outline's icons are meaningful (object, array, string, number, boolean, null),
  falling back to a neutral kind when no type is declared.
- **F31-FR-09** The provider MUST be registered only for documents recognised as
  schemas (F01's detection), so data files keep the editor's own JSON outline.

## Non-Functional Requirements

- **F31-NFR-01** The outline builder MUST be a pure, `vscode`-free module
  (symbol kinds expressed as a local enum the provider maps) with ≥ 80 %
  coverage (Article V).
- **F31-NFR-02** The builder MUST be total and bounded: unparsable text yields
  an empty outline, and recursion MUST be depth-capped so a self-referential or
  pathologically nested schema cannot hang the extension host (S03).
- **F31-NFR-03** Building the outline for a schema MUST stay well inside VS
  Code's symbol-provider budget; it MUST NOT resolve refs, read other files, or
  touch the network.

## Out of Scope

- Expanding `$ref` targets inline (F31-FR-04), and cross-file outlines.
- A bespoke tree view in the side bar. The document-symbol contribution reuses
  four existing surfaces; a custom view would duplicate them.
- Editing from the outline (drag-to-reorder, rename-in-place) — rename lives in
  F30.

## Acceptance Criteria

1. A schema with `properties.address.properties.street` outlines as
   `root → address → street`, not through `properties` nodes.
2. A required property's detail is visibly distinct from an optional one's.
3. A property whose value is `{"$ref":"#/$defs/Address"}` shows the ref as its
   detail and contributes no children.
4. A schema with `$defs` shows a `$defs` section listing each definition.
5. A self-recursive schema outlines without hanging and within the depth cap.

## Relation to Existing Specs

- **F01 (preview)** shares `describeType` for the detail string and its schema
  detection for provider registration.
- **F13 (`$ref` navigation)** is how a `$ref` symbol is followed; F31
  deliberately does not expand refs itself.
- **F24 (`$ref` graph)** gives the cross-definition view; F31 gives the
  in-document one.

## History

- **2026-09-02** — Initial specification.
