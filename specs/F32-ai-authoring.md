# F32 — AI-Assisted Schema Authoring

## Overview

Several schema chores are mechanical for a person but not expressible as an
algorithm: writing a `description` for `retryBackoffMs`, explaining what
`must match pattern "^[a-z][a-z0-9-]*$"` means to someone who did not write the
pattern, or turning "an order with line items and a shipping address" into a
first draft. This spec adds optional, opt-in assistance for exactly those, using
**VS Code's Language Model API** so the user's own configured model does the
work — the extension ships no vendor SDK, no model identifier, and never
handles an API key (S20-SR-05).

The design principle is that a model is a *drafting* tool, never an authority:
every artifact a model produces is put through the deterministic engines this
project already has — the schema must parse, compile under Ajv, survive the
linter (F17), and be able to produce a valid sample instance (F16) — before it
is offered, and nothing is ever applied without a preview. That verification
loop, not the prompt, is what makes the feature trustworthy, and it is the part
that is unit-tested.

The safety, privacy and agnosticity rules that govern all of this are specified
once in [S20](S20-ai-assistance.md); this spec covers the features themselves.

## User Stories

- As a schema author, I want the undocumented properties in my schema described
  in one pass, so `require-descriptions` findings stop being a chore I skip.
- As a developer hitting a validation error I don't understand, I want it
  explained against my actual schema and value, not in the abstract.
- As someone starting a schema, I want a first draft from a sentence — one I
  know already parses, lints and produces a valid example.
- As a reviewer, I want a schema diff turned into release notes I can paste.

## Functional Requirements

### Availability

- **F32-FR-01** All assistance MUST be disabled unless `jsonschema.ai.enabled`
  is `true`; its default MUST be `false` (S20-SR-01). Invoking an AI command
  while disabled MUST explain that and offer to enable the setting, and MUST NOT
  make any model request.
- **F32-FR-02** The extension MUST obtain a model exclusively through VS Code's
  Language Model API. When no model is available — the API is absent, no
  provider is configured, or consent is declined — the command MUST report that
  plainly and stop, and any deterministic fallback the feature has MUST still be
  offered (S20-SR-07).

### Verified generation

- **F32-FR-03** Any command producing a **schema** MUST put the model's output
  through a verification pipeline before showing it: the text MUST parse as
  JSON, MUST compile under the draft-matching Ajv dialect (F03-FR-15), MUST
  produce no `warning`-severity findings from the linter (F17), and MUST yield a
  valid instance from the sample generator (F16). Each stage's failures MUST be
  reported as structured problems.
- **F32-FR-04** When verification fails, the loop MUST retry, feeding the
  concrete failures back as the next attempt's input, up to a bounded number of
  attempts (default 3, at least 1). Exhausting the attempts MUST surface the
  last candidate together with the outstanding problems, clearly marked as
  unverified — never silently, and never as if it had passed.
- **F32-FR-05** The loop MUST be a pure function over an injected `generate`
  callback and an injected `verify` callback, so both the retry policy and the
  verification stages are unit-testable without a model.
- **F32-FR-06** Model output MUST be extracted tolerantly: a fenced code block
  (``` or ```json) MUST be unwrapped, surrounding prose discarded, and the first
  balanced JSON value used when a response contains more than one. Extraction
  MUST never throw.

### Commands

- **F32-FR-07** `jsonschema.ai.describeProperties` MUST draft a `description`
  for every property in the active schema that lacks one, and apply them as a
  single previewed, undoable workspace edit that changes *only* `description`
  keys — a returned schema differing anywhere else MUST be rejected.
- **F32-FR-08** `jsonschema.ai.explainDiagnostic` MUST be offered as a code
  action on a validation diagnostic (F03) or a lint finding (F17), and MUST
  explain that specific finding using the offending value and the governing
  subschema, ending with the concrete change that would fix it. Its output is
  prose shown to the user; it MUST NOT edit the document.
- **F32-FR-09** `jsonschema.ai.draftSchema` MUST take a natural-language
  description, run the verified-generation loop (F32-FR-03/04), and open the
  result in a new untitled editor beside the active one. The source document is
  never modified.
- **F32-FR-10** `jsonschema.ai.enrichSchema` MUST take an existing schema —
  typically one just inferred by F06 — and suggest `format` values, `enum`
  candidates for low-cardinality strings, `title`s and `$defs` names, returning
  a schema that MUST pass verification and MUST NOT remove or retype any
  existing property. Removals or type changes MUST be rejected.
- **F32-FR-11** `jsonschema.ai.generateRealisticData` MUST generate sample
  instances that read like real documents, and MUST discard any instance the
  schema rejects, reporting how many were kept. When `adversarial` is chosen it
  MUST instead keep only instances the schema *rejects*, each paired with the
  keyword it violates — the inverse gate, same mechanism.
- **F32-FR-12** `jsonschema.ai.migrationNotes` MUST turn a computed diff (F15)
  and its compatibility verdict (F26) into release-note prose, and MUST propose
  a backward-compatible alternative for each breaking entry. The diff is
  computed deterministically and passed in; the model never diffs.

### Data sent

- **F32-FR-13** A request MUST include only the artifacts the invoked command
  operates on — the schema, the offending value, the diff, or the user's own
  prompt text — plus the file's base name. Absolute paths, workspace layout,
  credentials (F07), settings values and the contents of unrelated files MUST
  NOT be included (S20-SR-06).

## Non-Functional Requirements

- **F32-NFR-01** Prompt construction, response extraction, the verification
  stages and the retry loop MUST be pure, `vscode`-free modules with ≥ 80 %
  coverage (Article V). Only model selection and the request itself are
  API-bound, and they MUST be thin enough to carry no logic.
- **F32-NFR-02** An assistance failure MUST never break a deterministic path:
  every AI command MUST be additive to a non-AI command that still works.
- **F32-NFR-03** Every request MUST be cancellable and MUST honour VS Code's
  progress/cancellation conventions, since model calls are long by editor
  standards (S03).

## Out of Scope

- Shipping, bundling, or defaulting to a specific model or vendor; storing an
  API key; any request the user did not initiate (S20).
- Applying an AI edit without a preview, or auto-running assistance on open,
  save, or type.
- A chat participant. The commands plus the agent tools (F33) cover the same
  ground through surfaces that already exist; a participant is a candidate
  follow-up once the tool surface has proven out.
- Using a model anywhere in the deterministic engines (validation, diff,
  bundling, codegen) — those MUST stay reproducible.

## Acceptance Criteria

1. With `jsonschema.ai.enabled` false, every AI command explains it is off,
   offers to enable it, and issues no model request.
2. A model response wrapped in a ```json fence, with prose before and after, is
   extracted to the JSON value.
3. A draft that fails Ajv compilation is retried with the compiler's message,
   and a draft that never verifies is shown marked unverified with its problems.
4. `describeProperties` on a returned schema that also retyped a property is
   rejected rather than applied.
5. `generateRealisticData` discards instances the schema rejects and reports the
   kept count.

## Relation to Existing Specs

- **S20 (AI assistance safety)** is the governing system spec: opt-in,
  verification, preview, agnosticity, and what may be sent.
- **S05 (privacy)** is amended by S20 to carve out user-initiated Language Model
  API requests from the "schema fetches only" rule.
- **F03/F16/F17** supply the verification stages; **F06** supplies the schema
  `enrichSchema` improves; **F15/F26** supply the diff `migrationNotes` narrates.
- **F33 (agent tools)** exposes the same deterministic engines *to* models,
  which is the mirror of this spec.

## History

- **2026-09-02** — Initial specification.
