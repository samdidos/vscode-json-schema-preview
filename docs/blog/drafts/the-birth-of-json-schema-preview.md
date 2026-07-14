---
title: The birth of JSON Schema Preview
date: 2026-07-14
author: Samuel Cardinal
draft: true
---

> **DRAFT — not published.** This file lives under `docs/blog/drafts/`, which is
> excluded from the site build (`srcExclude` in `.vitepress/config.ts`). Edit it
> freely; when it's ready, move it up to `docs/blog/` and add it to the blog
> sidebar to publish.

# The birth of JSON Schema Preview

_Draft notes — in my own voice, to be refined._

## Where it started

<!-- Your personal hook: the specific moment or frustration that made you build
this. A schema you couldn't read? A team contract nobody could follow? Say it in
one or two honest sentences — that's what makes an origin story land. -->

I kept running into the same wall: JSON Schema is everywhere — config files, API
contracts, CI pipelines — but *reading* one is miserable. You open a `.schema.json`,
scroll through nested `$ref`s and `allOf`s, and you still can't answer a simple
question: "what does a valid document actually look like?" I wanted the schema to
explain itself, right there in the editor, without leaving VS Code.

That's the whole seed of **JSON Schema Preview**: turn a schema into something a
human can read, validate against, and edit — live.

## What motivates me

<!-- This section is the heart of the post. A few threads you might pull on: -->

- **Tools should reduce friction, not add it.** Every feature had to earn its
  place by removing a real step from someone's day — previewing a schema,
  catching an invalid config before it ships, generating a sample payload
  instead of hand-writing one.
- **I care about the craft, not just the output.** [Say why quality is personal
  to you here — it reads as authentic when it's specific.]
- **Building in the open.** [If shipping publicly / on the Marketplace matters to
  you, this is the place to say it.]

## Why quality mattered so much to me

This is the part I'm proudest of, and it's worth being concrete about.

From the first commit I treated this like a project that had to be *trustworthy*,
not just functional. Concretely, that meant:

- **Every change traces to a written requirement.** Features are specified in
  RFC-2119 language under `specs/` before they're built. Nothing ships without a
  requirement ID, and a traceability checker fails the build if a spec, the
  matrix, and the tests ever drift apart. It sounds heavy; in practice it's what
  lets me move fast without breaking the contract with users.
- **The guarantees live below the tooling.** Coverage floors, linting,
  type-checking, and traceability all run in CI and in a git pre-commit hook, so
  they hold for *anyone* — me, a contributor, or an AI agent — because they fire
  on the commit, not on a particular editor.
- **I went past the usual bar.** Mutation testing, a real end-to-end suite
  running in an actual VS Code instance on Linux and Windows, SLSA build
  provenance, dependency and secret scanning. Not because a hobby extension
  strictly needs all of it, but because I wanted to *learn* what "done right"
  looks like and hold myself to it.

The point wasn't ceremony. It was that I could add a feature months later and
know — mechanically, not by memory — that I hadn't quietly broken something.

## How AI leveraged this project

<!-- Be honest and specific here — this is the part readers will find most
interesting, and the most credible if it's grounded. -->

AI didn't write this project *for* me — it worked *with* me, inside the guardrails
I'd built. That distinction turned out to be everything.

Because the requirements were written down and the quality gates were mechanical,
an AI agent could pick up a task ("add draft migration between JSON Schema
versions") and I could trust the *system*, not the model, to catch mistakes: if
it wrote code that didn't trace to a spec, the traceability check failed; if it
dropped coverage, CI went red; if it made a schema transform that looked right
but wasn't, the end-to-end suite caught it. [Add the concrete example here — the
migration bug the E2E test caught that the unit tests missed is a great, true
anecdote.]

A few things I learned:

- **AI is an accelerator, and the gates are the seatbelt.** The faster you let an
  agent move, the more the automated guarantees earn their keep.
- **Tool-agnosticity is worth protecting.** I deliberately kept the durable
  knowledge — specs, the constitution, `AGENTS.md` — in plain, vendor-neutral
  formats, so the project doesn't depend on any single AI tool or model. Swap the
  agent tomorrow and nothing important is lost.
- **Writing things down pays off twice.** The specs I wrote for my own clarity
  turned out to be the exact context an AI needs to contribute well.

## What's next

<!-- Optional close: where the project is headed, or an invitation to try it /
contribute. -->

[Wrap up in your own words — what you're building next, and how people can try it
or get involved.]

---

_If you've read this far: the extension is on the VS Code Marketplace, and the
whole thing — specs, tests, CI and all — is open on
[GitHub](https://github.com/samdidos/vscode-json-schema-preview)._
