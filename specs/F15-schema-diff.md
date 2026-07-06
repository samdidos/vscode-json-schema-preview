# F15 — Schema Diff & Breaking-Change Detection

## Overview

Compare two versions of a schema and classify every change as **breaking**,
**non-breaking**, or **informational** for instance-document compatibility.
The default comparison is the working copy against the file's last committed
version (git HEAD); any file or remote URL can be chosen instead. Teams that
publish schemas to consumers get an answer to "can I ship this?" without
leaving the editor.

## User Stories

- As a schema owner, I want to see whether my edits break existing valid
  documents before I commit, so consumers don't get surprise validation
  failures.
- As a reviewer, I want a categorised change list (not a raw text diff) when a
  schema PR lands, so I can judge compatibility at a glance.
- As a platform engineer, I want to diff my local schema against the published
  registry copy (behind auth), so I know what the next release will change.

## Functional Requirements

### Command and Targets

- **F15-FR-01** A command `jsonschema.diffSchema` MUST be available when
  `jsonschema.isJsonSchema` is `true`.
- **F15-FR-02** The baseline picker MUST offer, in order: **Git HEAD** (only
  when the file is inside a git repository and has a committed version),
  **Workspace file…**, and **Remote URL…** (fetched via F07 auth and the
  standard timeout).
- **F15-FR-03** Git access MUST use the built-in `vscode.git` extension API
  (no shelling out to `git`), degrading gracefully (option hidden) when the
  extension or repository is unavailable.

### Change Classification

- **F15-FR-04** The comparator MUST walk both schemas structurally (order- and
  formatting-insensitive; key order and whitespace changes are not changes).
- **F15-FR-05** At minimum these changes MUST be classified **breaking** (an
  instance valid before can become invalid): property removed while
  `additionalProperties` is/becomes `false`; a name added to `required`; a
  type removed from `type`; an `enum`/`const` value removed or narrowed;
  numeric/string/array constraints tightened (`minimum` raised, `maxLength`
  lowered, etc.); `additionalProperties`/`additionalItems` changed from
  permissive to restrictive; a new `oneOf`/`allOf` branch that restricts
  previously valid instances (heuristic: any added `allOf` entry is breaking).
- **F15-FR-06** At minimum these changes MUST be classified **non-breaking**:
  optional property added; a name removed from `required`; constraints
  relaxed; `enum` values added; type added to a `type` array.
- **F15-FR-07** Changes to `title`, `description`, `examples`, `default`,
  `$comment`, and unknown/extension keywords MUST be classified
  **informational**.
- **F15-FR-08** A change the classifier cannot reason about MUST be reported
  as **unclassified** — never silently dropped.

### Reporting

- **F15-FR-09** Results MUST be presented as a grouped, text-first report
  (breaking → non-breaking → informational → unclassified), each entry naming
  the JSON Pointer path, the change, and old → new values. The report opens in
  a read-only editor or webview; if a webview is used it MUST follow all S01
  rules and S06 semantics (headings, no colour-only severity cues).
- **F15-FR-10** A one-line summary notification MUST state the counts (e.g.
  "2 breaking, 5 non-breaking changes") with a button to open the report.
- **F15-FR-11** When the two versions are structurally identical the command
  MUST say so and MUST NOT open an empty report.

## Non-Functional Requirements

- **F15-NFR-01** Comparison MUST run in-process; 500 KB schemas SHOULD
  compare in under 1 s.
- **F15-NFR-02** The classifier MUST be a pure module (no `vscode` imports)
  with table-driven unit tests per rule in F15-FR-05/06/07 (≥ 80 % coverage,
  Article V). Property-based tests with `fast-check` are RECOMMENDED (e.g.
  "classifier never throws on arbitrary JSON pairs").

## Out of Scope

- Full semantic equivalence/subsumption checking (undecidable in general) —
  classification is rule-based and conservative, hence **unclassified**.
- Diffing external `$ref` targets (refs are compared by their ref string;
  bundle first via F14 for a deep compare).
- CI enforcement — pairs with the long-term companion-CLI idea.

## Acceptance Criteria

1. Adding a property name to `required` and running the diff against Git HEAD
   reports one **breaking** change at the correct pointer path.
2. Adding an optional property reports **non-breaking**; editing a
   `description` reports **informational**.
3. Reformatting the file (whitespace/key order only) reports "no structural
   changes".
4. Diffing against a private remote URL uses stored credentials; 401 surfaces
   the *Configure Auth* offer.
5. Every entry in the report names a JSON Pointer path and old → new values,
   and severity is conveyed by text labels, not colour alone.

## Open Questions

- Q1 — Report surface: read-only virtual document (plain text/Markdown, zero
  webview risk) vs. webview (richer layout). Leaning virtual document for v1.

## Relation to Existing Specs

- Reuses **F07** (auth) for remote baselines.
- Complements **F14** — bundle-then-diff enables deep multi-file comparison.
- **S01/S06** govern the report surface; **S05**: schema contents never leave
  the machine except the user-chosen baseline fetch.
