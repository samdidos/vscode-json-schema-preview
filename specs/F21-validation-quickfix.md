# F21 — Validation Quick Fixes

## Overview

F03 validates *data* files against their bound schema and reports each failure
as a diagnostic in the Problems panel. This feature turns those diagnostics from
reports into **actions**: a lightbulb (VS Code Code Action) that mechanically
repairs the most common, unambiguously-fixable Ajv errors — a missing required
property, an unexpected extra property, a value outside an `enum`/`const`, or a
scalar of the wrong `type`.

Only *safe, mechanical* repairs are offered. Anything whose correct value the
extension cannot know (a string that must match a `pattern`, a number bound, a
`format`) has no quick fix — consistent with F17's "rules without a safe
mechanical fix MUST NOT offer one" (F17-FR-12).

## User Stories

- As a config author, when validation says `name` is required and missing, I
  want a one-click fix that inserts `"name"` with a sensible typed placeholder,
  instead of hand-editing and re-reading the schema for the expected type.
- As a developer, when I typo an `enum` value, I want to pick the intended value
  from the allowed set rather than copy it out of the schema.
- As a developer, when a field is `"5"` but the schema wants a number, I want a
  fix that rewrites it to `5`.

## Functional Requirements

### Fix computation (pure)

- **F21-FR-01** A pure module MUST map an Ajv error (its `keyword`,
  `instancePath`, and `params`) plus the schema and the parsed data to zero or
  more concrete fixes. Each fix MUST be self-describing: a title, the JSON
  Pointer path to the node it edits, and the value to write (or a removal flag)
  — with no dependency on `vscode`.
- **F21-FR-02** `required` errors MUST yield an *add-property* fix that inserts
  the missing property (`params.missingProperty`) into the object at
  `instancePath`. The inserted value MUST be resolved from the property's own
  subschema (best-effort walk through `properties`/`items`): `const`, else
  `default`, else `enum[0]`, else a type-appropriate empty value (`""`, `0`,
  `false`, `[]`, `{}`, `null`); when the subschema cannot be resolved the value
  MUST default to `null`.
- **F21-FR-03** `additionalProperties` errors MUST yield a *remove-property*
  fix that deletes the offending property (`params.additionalProperty`) from the
  object at `instancePath`.
- **F21-FR-04** `enum` errors MUST yield one *set-value* fix per allowed value
  (`params.allowedValues`), each replacing the node at `instancePath`. The
  number of fixes offered MUST be capped (≤ 6) so a large enum does not flood
  the lightbulb; `const` errors MUST yield a single *set-value* fix to
  `params.allowedValue`.
- **F21-FR-05** `type` errors MUST yield a *coerce* fix only when the current
  value converts to an expected type **without loss**: number/boolean → string,
  a numeric string → number (integer only when integral), and `"true"`/`"false"`
  → boolean. No fix MUST be offered when no lossless coercion exists.
- **F21-FR-06** Edits MUST be computed against the document's **current** text at
  the moment the lightbulb is invoked (via `jsonc-parser`'s `modify`), not
  captured at validation time, so a fix stays correct after unrelated edits and
  never corrupts the file with stale offsets. A fix whose target node no longer
  exists MUST produce no edit (and thus no action).

### Presentation (Code Action provider)

- **F21-FR-07** Fixes MUST be surfaced as `QuickFix` code actions associated
  with the F03 validation diagnostics (`source: "JSON Schema"`), so the
  lightbulb appears on exactly those diagnostics and each action clears its
  diagnostic when applied.
- **F21-FR-08** A fix MUST be offered only when the error it addresses is among
  the validation diagnostics in context — matched by the error's instance path
  (carried on the diagnostic), not by geometric range overlap — so an unrelated
  error elsewhere does not surface its fix at the cursor, while a value-editing
  fix still appears when its diagnostic sits on the property key.
- **F21-FR-09** Recorded fixes MUST be cleared when the document changes or
  closes, and replaced wholesale on each re-validation, so the lightbulb never
  offers a fix derived from a superseded validation run.

### Other data formats

The fixes of F21-FR-02..05 (and F25's ranking and rename) are the same for every
format validation supports; what differs is how an edit is written.

- **F21-FR-10** **YAML.** Changing a value or renaming a key MUST rewrite only
  that node's own token, located by the YAML parser's source range. Adding or
  removing a property MUST change only the lines the property occupies: the
  indentation, comments, line endings and final-line-break state of the rest of
  the document MUST be preserved. Where the document's layout cannot be
  reproduced line for line by the parser's own serialiser — so the changed lines
  cannot be isolated — no add/remove fix MUST be offered, rather than a fix that
  reformats the file.
- **F21-FR-11** **TOML.** Edits MUST be positioned by the F11-FR-20 scan: a
  value fix rewrites the value literal; a rename rewrites the key token of a
  `key = value` pair; a removal deletes the pair's whole statement, including a
  multi-line value and its line break; an addition writes a new `key = value`
  line at the end of the owning table's own pairs (for the root table with no
  pairs: ahead of the first header), indented like its siblings. No edit MUST be
  produced where the change would restructure the document or cannot be
  expressed: the property is itself a `[table]`, a dotted-key table or an
  array of tables; the owning table is inline or exists only through dotted
  keys; or the value has no TOML spelling (`null`).
- **F21-FR-12** **JSONL.** Every record is validated on its own, so each fix
  MUST be tied to the record that produced it and its edit confined to that
  record's line, written without reformatting so the record stays on one line.
  A JSONL diagnostic MUST be located inside its record's line (the whole record
  for a root-level error) and MUST carry the record's number alongside the
  instance path (F21-FR-08), so a fix for one record is never offered on
  another record's identical path.
- **F21-FR-14** For YAML, TOML and JSONL an edit MUST be offered only after it
  has been checked: applying it to the current text MUST yield a document that
  parses to exactly the original data with that one fix applied. An edit that
  fails the check — or whose result no longer parses — MUST be discarded, so
  these formats can lose a fix but never gain a wrong one.

### Fix all

- **F21-FR-13** When more than one of a document's recorded fixes can be
  applied without a choice, the lightbulb MUST additionally offer a single
  action — `Fix all N auto-fixable validation problems` — that applies them
  together. "Without a choice" means: every missing required property, `const`
  and lossless type coercion, plus an `enum` change or a property rename **only**
  when it is the preferred near-miss (F25-FR-03 / F25-FR-05). It MUST NOT
  include removing an unexpected property (that deletes data) or an `enum`
  change that is not preferred, and MUST apply at most one fix per node. The
  fixes MUST be applied in sequence, each computed against the text the previous
  ones produced, with a fix that no longer applies skipped rather than failing
  the rest; `N` is the number that took effect.

## Non-Functional Requirements

- **F21-NFR-01** Fix computation MUST run in-process and MUST NOT perform
  network or filesystem I/O (the schema and data are already in hand from F03).
- **F21-NFR-02** The pure fix module MUST have its own unit-test suite
  (positive, negative, and edge fixtures; ≥ 80 % coverage, Article V), verifying
  the *applied* text, not just the intent.

## Out of Scope

- Multi-document YAML files, and TOML changes that would restructure the
  document (F21-FR-11 lists them) — those yield no fix.
- Fixes for keywords with no knowable correct value (`pattern`, `format`,
  numeric bounds, `minLength`/`maxLength`, `uniqueItems`).
- Fix-on-save, and a fix-all that spans several files. Fixes are recorded for
  the text version that was validated and dropped on the next edit
  (F21-FR-09), so there is nothing reliable to apply at save time.
- Repairing the *schema* (that is F17's domain); this repairs the *data*.

## Acceptance Criteria

1. Data `{}` against `{ "required": ["name"], "properties": { "name": { "type":
   "string" } } }` offers "Add missing required property "name"" whose result is
   `{ "name": "" }`.
2. Data `{ "extra": 1 }` against a schema with `additionalProperties: false`
   offers a fix that leaves `{}`.
3. Data `{ "color": "purpel" }` against `{ "enum": ["red","green"] }` on `color`
   offers one fix per allowed value; applying one leaves a valid document.
4. Data `{ "age": "5" }` against `{ "age": { "type": "integer" } }` offers a
   coercion whose result is `{ "age": 5 }`; `{ "age": "5.5" }` offers none.
5. Editing the document after validation and then invoking the lightbulb applies
   against current text (no corruption); a fix whose node was deleted disappears.
6. In a YAML file indented with four spaces whose values carry aligned trailing
   comments, adding a missing property to a nested mapping inserts one line at
   that mapping's indentation and changes no other line.
7. In a TOML file, a missing property of `[server]` is added as the last line of
   that table's block; an unexpected property that is itself a `[server.extra]`
   table offers no removal.
8. In a JSONL file where records 2 and 5 both fail at `/age`, the fix offered on
   record 2 edits line 2 only.
9. A document with a missing required property, a `"5"` that should be `5`, a
   mistyped enum value and an unexpected property offers `Fix all 3 auto-fixable
   validation problems`; applying it leaves only the unexpected property.

## Relation to Existing Specs

- Builds directly on **F03** (data validation) — reuses its diagnostics and
  their `source: "JSON Schema"` tag; adds no new validation.
- Mirrors **F17-FR-12**'s quick-fix discipline (only safe mechanical fixes) and
  the `SchemaLintManager` code-action pattern.
- **S03**: in-process, no I/O; **S06**: actions carry descriptive titles and are
  reachable from the standard VS Code lightbulb (keyboard-accessible).

## History

- 2026-11-17 — Added F21-FR-10..14: YAML, TOML and JSONL fixes, the
  parse-back check that guards them, and fix-all — all previously Out of Scope.
  `modify` being JSON-only stopped being a reason once F11-FR-20 gave TOML
  positions and the YAML parser's own ranges and serialiser could be used; the
  JSONL ambiguity is resolved by tying each fix and diagnostic to its record.
  Fix-all deliberately excludes removals: it is the one fix kind that destroys
  data.
