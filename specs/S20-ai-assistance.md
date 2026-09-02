# S20 — AI Assistance Safety & Verification

## Overview

This project's stance on AI features is the same as its stance on tooling
generally: an accelerator may never become the guarantee. A model can draft a
description, explain an error, or propose a schema; it may never be the thing
that decides whether a document is valid, whether a change is breaking, or what
lands in a user's file unreviewed.

This spec states the rules every AI-facing feature (F32) obeys, so the
constraints live in one place rather than being restated per feature. They exist
for three reasons: this extension collects nothing and should keep that property
visible (S05); the project deliberately maximises model and tool agnosticity, so
nothing may hard-depend on one vendor; and a schema tool whose output cannot be
trusted is worse than no tool, so machine-generated artifacts must be checked by
the deterministic engines that already exist here.

## Requirements

### Opt-in and user initiation

- **S20-SR-01** Every AI-assisted capability MUST be gated behind a setting
  that defaults to **off**. Enabling it MUST be an explicit user action, and the
  setting's description MUST state that enabling it sends the artifacts named in
  S20-SR-06 to the user's configured language model.
- **S20-SR-02** A model request MUST only ever be made in direct response to a
  user action — a command, a code action, or an agent tool invocation. There
  MUST be no request on activation, open, save, type, focus change, or timer,
  and no speculative pre-fetching.

### Verification before offering

- **S20-SR-03** Any artifact a model produces that this extension would treat as
  a schema, a data instance, or an edit MUST be verified by the project's own
  deterministic engines before it is shown as a result: schemas MUST parse,
  compile, and lint clean of warnings; instances MUST be validated against the
  schema they claim to satisfy.
- **S20-SR-04** No AI-produced change MUST be written to a user's file without a
  preview the user confirms, and every applied change MUST be a single undoable
  edit. An edit whose scope exceeds what the command promised (e.g. a
  description pass that also changes types) MUST be rejected rather than applied.
- **S20-SR-05** An artifact that fails verification MUST NOT be presented as if
  it passed. It is either retried, or surfaced explicitly marked as unverified
  alongside the problems found.

### Agnosticity

- **S20-SR-06** The shipped extension MUST NOT contain a vendor SDK, a hardcoded
  model identifier, an API endpoint, or any credential-handling code for a model
  provider. Model access MUST go through the editor's own Language Model API, so
  the user's configured provider is used and swapping it changes nothing here.
- **S20-SR-07** A request MUST carry only the artifacts the invoked capability
  operates on, plus a file's base name. Absolute paths, workspace structure,
  stored credentials (F07), settings values, and unrelated file contents MUST
  NOT be sent. What each capability sends MUST be documented on the docs site.

### Degradation

- **S20-SR-08** Every AI capability MUST be additive to a deterministic path
  that remains fully functional when AI is disabled, unavailable, refused, or
  failing. No existing behaviour may become dependent on a model.
- **S20-SR-09** The deterministic engines (validation, linting, diff and its
  compatibility verdict, bundling, migration, code generation, sample
  generation, coverage) MUST remain reproducible and model-free. Their outputs
  MUST NOT vary with AI settings or model availability.

### Testability

- **S20-SR-10** The model-facing boundary MUST be narrow enough to be injected:
  prompt construction, response extraction, verification and retry MUST be pure
  and unit-tested, so the correctness of an AI feature is testable without a
  model. Only model selection and the request call itself may be API-bound.

## Rationale for the verification stack

The stages are ordered cheapest-first and each rules out a distinct failure the
previous cannot see:

| Stage | Catches |
|---|---|
| Parse | Truncated output, prose leaked into the payload, invalid JSON |
| Ajv compile | Structurally valid JSON that is not a valid schema (bad `type`, malformed `pattern`, unresolvable local `$ref`) |
| Lint (F17) | A schema that compiles but is poor: unknown keywords, duplicate enums, required names that are not declared |
| Sample (F16) | A schema that compiles and lints but is unsatisfiable — no document can validate against it |

The sample stage is the one that catches the most damaging class, because an
unsatisfiable schema fails silently: it never rejects at authoring time, only
later, against every document anyone writes.

## Out of Scope

- Whether a particular model is good at schemas. This spec constrains the
  *mechanism*; model quality is the user's choice, which is the point of
  S20-SR-06.
- Evaluation harnesses or quality benchmarking of model output.
- Telemetry of any kind about AI usage — S05-SR-01 is unconditional and this
  spec does not weaken it.

## Acceptance Criteria

1. With the AI setting at its default, no code path can reach a model request.
2. `grep` for a vendor SDK, model id, or provider endpoint in `src/` returns
   nothing (asserted by a test).
3. A generated schema that compiles but cannot produce a valid instance is
   reported as unverified rather than offered.
4. Disabling AI leaves every command in F01–F31 behaving identically.

## Relation to Existing Specs

- **S05 (privacy)** — amended by this spec: S05-SR-02's "schema fetches only"
  rule gains an explicit, opt-in, user-initiated Language Model API carve-out,
  with S20-SR-07 bounding what may be sent. S05-SR-01 (zero telemetry) is
  unchanged and unconditional.
- **F32 (AI-assisted authoring)** is the feature spec these rules govern.
- **F33 (agent tools)** points the relationship the other way — models calling
  this project's deterministic engines — and inherits S20-SR-02's
  user-initiation rule via the editor's own tool-invocation consent.

## History

- **2026-09-02** — Initial specification, alongside F32.
