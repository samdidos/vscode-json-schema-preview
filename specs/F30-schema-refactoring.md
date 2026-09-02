# F30 — Schema Refactorings

## Overview

Every editor ships refactorings for code — extract, inline, rename, find
references — and none of them understand a JSON Schema. Restructuring a schema
today is manual text surgery: copy a subschema into `$defs`, hand-write the
`$ref`, then grep for every other place that should now point at it, and hope
nothing was missed. The consequences of missing one are silent: a stale local
`$ref` still resolves to the old definition, so the schema stays valid while
meaning something different from what its author intended.

This spec adds schema-aware structural edits over the same offset-carrying AST
F13 and F17 already build: **extract to `$defs`**, **inline a `$ref`**,
**rename a definition** (updating every local reference), **find all
references**, and **remove unused definitions**. Each is a pure text-edit
computation over parsed source, so formatting and comments outside the edited
span survive untouched — a reserialise-the-whole-document approach would not.

## User Stories

- As a schema author, I want to lift a repeated inline object into `$defs` and
  have the original site become a `$ref`, without hand-writing the pointer.
- As a maintainer, I want to rename a definition and have every `$ref` to it
  follow, so a rename is not a silent breakage.
- As a reviewer, I want to see which definitions nothing references, so dead
  schema surface can be deleted with confidence rather than left "just in case".

## Functional Requirements

### Edit model

- **F30-FR-01** Every refactoring MUST be expressed as a list of `TextEdit`
  operations (`{ offset, length, newText }`) against the *unmodified* source
  text, non-overlapping and applicable in any order when applied
  highest-offset-first. The engine MUST NOT reserialise the document.
- **F30-FR-02** A refactoring that cannot be applied safely MUST return an empty
  edit list together with a reason, never a partial or best-effort edit.
- **F30-FR-03** Inserted text MUST match the surrounding document's indentation
  unit, detected from the source (tabs vs. the modal space width), so an edit
  does not reformat the file it lands in.

### Extract to `$defs`

- **F30-FR-04** Given an offset inside an object subschema, **extract** MUST
  move that subschema into the root `$defs` (creating `$defs` when absent, or
  reusing `definitions` when the document already uses that spelling) under a
  caller-supplied name, and replace the original span with
  `{ "$ref": "#/$defs/<name>" }`.
- **F30-FR-05** Extract MUST refuse when the target is the root schema itself,
  when it is already only a `$ref`, when it sits inside `$defs`/`definitions`
  at the top level (it is already a definition), or when the chosen name is
  already taken.

### Inline a `$ref`

- **F30-FR-06** Given an offset on a local (`#/…`) `$ref`, **inline** MUST
  replace the containing object with the referenced subschema's source text.
- **F30-FR-07** Inline MUST refuse for a non-local `$ref` (F13's `relative` /
  `remote` kinds — that is F14's job), for an unresolvable pointer, and when the
  reference is recursive (the target transitively references the site), which
  cannot be inlined without expanding forever.
- **F30-FR-08** When the `$ref` object carries sibling keywords, inline MUST
  refuse rather than silently drop them, since merging `$ref` with siblings has
  draft-dependent semantics.

### Rename & find references

- **F30-FR-09** **Find references** MUST return the source span of the
  definition's key and of every local `$ref` string pointing at it, including
  refs nested at any depth. Pointer comparison MUST be RFC 6901-correct, so an
  escaped name (`a~1b`) matches its unescaped definition key (`a/b`).
- **F30-FR-10** **Rename** MUST rewrite the definition's key and every span
  found by F30-FR-09, escaping the new name for use inside a pointer. Rename
  MUST refuse when the new name is empty or already defined.

### Unused definitions

- **F30-FR-11** **Unused definitions** MUST report every entry under
  `$defs`/`definitions` that no local `$ref` in the document targets, treating a
  definition referenced only by another unused definition as itself unused
  (transitive reachability from the root, not a plain reference count).
- **F30-FR-12** **Remove unused** MUST delete those entries together with their
  separators, leaving a document that still parses. Removing every entry MUST
  leave a valid empty `$defs` object rather than dangling punctuation.

### Editor surface

- **F30-FR-13** Extract, inline and remove-unused MUST be offered as
  `refactor`-kind code actions at the positions where they apply; rename MUST be
  wired to the editor's own rename affordance (F2) via a rename provider, and
  find-references via a reference provider, so the standard editor gestures work.
- **F30-FR-14** Unused definitions MUST additionally surface as `Hint`-severity
  diagnostics tagged `Unnecessary` on the definition key, so they dim in place
  the way unused code does.

## Non-Functional Requirements

- **F30-NFR-01** The refactoring engine MUST be a pure, `vscode`-free module
  with ≥ 80 % coverage (Article V); only the provider wiring is API-bound.
- **F30-NFR-02** Refactorings MUST be **semantics-preserving for local
  references**: applying one MUST NOT change which documents the schema accepts.
  The refusal rules above (F30-FR-05/07/08) exist to keep that guarantee total
  rather than probabilistic.
- **F30-NFR-03** Every refactoring MUST be total on arbitrary input text: an
  unparsable or non-object document yields a refusal, never an exception.
  Property-based coverage with `fast-check` is RECOMMENDED.

## Out of Scope

- YAML sources. Offset-accurate structural edits over YAML's block/flow forms,
  anchors and comment attachment are a materially different problem; JSON/JSONC
  only, as with F17's autofixes.
- Cross-file refactorings (renaming a definition another file `$ref`s, moving a
  definition to another document). Workspace-wide `$ref` rewriting needs F14's
  resolution machinery and is a candidate follow-up.
- Merging `$ref` with sibling keywords, and any refactoring that changes which
  documents validate (widening/narrowing helpers).

## Acceptance Criteria

1. Extract on an inline `address` object yields `{"$ref":"#/$defs/Address"}` at
   the site and an `Address` entry under `$defs` whose text is the original.
2. Inline on `{"$ref":"#/$defs/Address"}` restores the definition's text; the
   same operation on a self-recursive definition refuses with a reason.
3. Renaming `$defs/Address` to `Postal` rewrites the key and all three `$ref`s
   that pointed at it, and leaves an unrelated `#/$defs/Country` untouched.
4. A definition referenced only from another unreferenced definition is
   reported unused; deleting both leaves a document that parses.
5. Extracting into a document indented with tabs produces tab-indented text.

## Relation to Existing Specs

- **F13 (`$ref` navigation)** listed rename and find-all-references as out of
  scope; this spec is where they land, reusing F13's pointer parsing, AST
  locators and `refKind` classification.
- **F14 (bundling)** flattens *external* refs; F30 restructures *local* ones.
  They meet at inline, which F30 deliberately restricts to local refs.
- **F24 (`$ref` graph)** already shows unused definitions as isolated nodes;
  F30-FR-11 turns that observation into an actionable edit.

## History

- **2026-09-02** — Initial specification.
