# F25 — Nearest-Match Ranking for `enum` Quick Fixes

## Overview

F21 already offers a quick fix for a value that violates an `enum`/`const`: it
lists the allowed values so you can pick one. But it lists them in *schema
order*, which is rarely the order of usefulness — when someone writes `"prod"`
and the schema allows `["development", "staging", "production"]`, the intended
value (`"production"`) is offered last. This spec makes the offending value
inform the fix: rank the allowed `enum` values by how close they are to what the
user actually typed, offer the closest first, and mark it as the preferred fix
when it is a clear near-miss (a typo or a case difference). It's a small change
with an outsized effect on the common case — a mistyped or wrong-case enum
value — and it extends F21 without touching any other fix kind.

## User Stories

- As someone editing a config, when I type an enum value with a typo or the
  wrong case, I want the closest valid value offered first (and highlighted), so
  one keystroke fixes it instead of my scanning a list.
- As a schema consumer, I don't want the ordering of `enum` in the schema to
  determine which suggestion I see first — I want relevance to my input.

## Functional Requirements

- **F25-FR-01** When an `enum` validation error is fixed (F21-FR-03), the allowed
  values MUST be ranked by similarity to the offending value (closest first)
  *before* the fix-count cap is applied, so the cap keeps the nearest candidates
  rather than the first-declared ones.
- **F25-FR-02** Similarity between two string values MUST use a Levenshtein edit
  distance, compared case-insensitively first with the case-sensitive distance
  as a tie-break, and a stable fall-back to schema order for equal distances.
  When the offending value or a candidate is not a string, that candidate MUST
  fall back to schema order (ranking never throws and never reorders values it
  cannot compare).
- **F25-FR-03** The closest candidate MUST be labelled as such in its fix title
  (e.g. `Change to "production" (closest match)`), and MUST be marked the
  **preferred** quick fix (so the editor can apply it as the default) only when
  it is a genuine near-miss: a case-only difference, or an edit distance within
  a small fraction of the candidate's length. A distant closest value is still
  offered first but MUST NOT be marked preferred.
- **F25-FR-04** This ranking MUST NOT change the behaviour of any other fix kind
  (`required`, `additionalProperties`, `const`, `type`): `const` has a single
  allowed value and is unaffected.

## Non-Functional Requirements

- **F25-NFR-01** The ranking (`rankEnumCandidates`, the edit-distance helper)
  MUST be a pure addition to the `validationFix` module with ≥ 80 % unit-test
  coverage (Article V), table-driven over the F25-FR-02/03 cases. The
  `isPreferred` wiring in `ValidationFixProvider` is the only VS Code-bound part.
- **F25-NFR-02** Edit-distance computation MUST be bounded to the already-capped
  candidate set and short enum strings; it introduces no new async or I/O and
  runs in the same pass as F21's fix computation (S03).

## Out of Scope

- Fuzzy-matching for keywords other than `enum` (e.g. suggesting a near-miss
  property name for an `additionalProperties` error) — a possible future spec.
- Semantic/synonym matching (`"prod"` ↔ `"production"` works by edit distance,
  but `"live"` ↔ `"production"` does not) — this is lexical similarity only.
- Changing how `enum` errors are detected or flagged (that is F03/AJV).

## Acceptance Criteria

1. Value `"prod"` against `enum ["development", "staging", "production"]` offers
   `Change to "production" (closest match)` first, marked preferred.
2. Value `"PRODUCTION"` (wrong case) offers `"production"` first, marked
   preferred (case-insensitive distance 0).
3. Value `"zzzzz"` against the same enum still offers a closest-first ordering
   but the closest is **not** marked preferred (too distant).
4. A numeric offending value against a numeric enum keeps schema order and never
   throws.
5. `const`, `required`, `additionalProperties`, and `type` fixes are byte-for-byte
   unchanged.

## Relation to Existing Specs

- Extends **F21** (validation quick fixes) — same code-action surface, same
  edit-computation pipeline; only the `enum` candidate ordering and the
  preferred flag are added.
- Honours **S03** (no new I/O or latency) and the F17/F21 discipline of offering
  only safe, mechanical fixes.
