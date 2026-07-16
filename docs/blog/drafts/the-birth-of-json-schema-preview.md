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

I kept running into the same small annoyance: JSON Schema is everywhere — config
files, API contracts, CI pipelines — but *reading* one is a bit of a slog. You
open a `.schema.json`, scroll through nested `$ref`s and `allOf`s, and you still
can't easily answer the simple question: "what does a valid document actually
look like?" Nothing dramatic — just a papercut I hit often enough that fixing it
sounded more fun than living with it.

So I gave it a shot. That's the whole seed of **JSON Schema Preview**: turn a
schema into something a human can read, validate against, and edit — live, right
there in the editor.

## What kept me going

Honestly, mostly that it was fun. A few things I found myself caring about along
the way:

- **Tools should reduce friction, not add it.** Every feature had to earn its
  place by removing a real step from someone's day — previewing a schema,
  catching an invalid config before it ships, generating a sample payload
  instead of hand-writing one. If it didn't do that, it didn't go in.
- **I enjoy getting the details right.** Not because anyone's grading a side
  project, but because tidy, predictable tools are just nicer to use — and nicer
  to build on later.
- **Building in the open.** It's on the Marketplace and the whole repo is public.
  I like that anyone can poke at how it works, disagree, or send a fix.

## Treating a side project like it matters

Here's the part I had the most fun with, and it's worth being concrete about.

I decided early to treat this small extension as if it were something people
depended on — not because it strictly needs that, but because I wanted to see how
far I could push the quality bar on a project I fully controlled. It turned into a
nice little playground for "how would I do this *properly*?"

Concretely, that meant:

- **Every change traces to a written requirement.** Features are specified in
  RFC-2119 language under `specs/` before they're built, and a traceability
  checker fails the build if a spec, the matrix, and the tests ever drift apart.
  It sounds heavy for a side project; in practice it's what lets me wander back
  months later and still trust the thing.
- **The guarantees live below the tooling.** Coverage floors, linting,
  type-checking, and traceability all run in CI and in a git pre-commit hook, so
  they hold for *anyone* — me, a contributor, or an AI agent — because they fire
  on the commit, not on a particular editor.
- **I got to try the fancy stuff.** Mutation testing, a real end-to-end suite
  running in an actual VS Code instance on Linux and Windows, SLSA build
  provenance, dependency and secret scanning. A hobby extension doesn't *need*
  all of it — I just wanted to learn what "done right" looks like with my own
  hands on the wheel.

The upshot is that the repo now works pretty well as a boilerplate: if I start
something new tomorrow, I've got a known-good template for the whole
specs-tests-CI setup, already shaken out on a real project instead of a toy.

## How AI leveraged the whole thing

This is the part I find most interesting, so I'll be specific about it.

AI didn't write this project *for* me — it worked *with* me, inside the guardrails
I'd already built. And that combination is what made the quality bar above
actually affordable for one person on nights and weekends.

Because the requirements were written down and the quality gates were mechanical,
an AI agent could pick up a task — "add draft migration between JSON Schema
versions" — and I could trust the *system*, not the model, to catch mistakes: if
it wrote code that didn't trace to a spec, the traceability check failed; if it
dropped coverage, CI went red; if it made a schema transform that looked right
but wasn't, the end-to-end suite caught it. The gates don't care whether a human
or an agent typed the code, which is exactly the point.

A few things I picked up:

- **AI is an accelerator, and the gates are the seatbelt.** The faster you let an
  agent move, the more those automated guarantees earn their keep. It also turned
  the project into a genuine stress test — a way to find where my quality setup
  held up and where it didn't.
- **Tool-agnosticity is worth protecting.** I deliberately kept the durable
  knowledge — specs, the constitution, `AGENTS.md` — in plain, vendor-neutral
  formats, so the project doesn't lean on any single AI tool or model. Swap the
  agent tomorrow and nothing important is lost.
- **Writing things down pays off twice.** The specs I wrote for my own clarity
  turned out to be the exact context an AI needs to contribute well.

## Have a look, and jump in if you like

That's really the whole story: someone spotted a small annoyance, had fun fixing
it, and used it as an excuse to learn how to build things carefully — with a lot
of help from AI along the way.

If any of that sounds useful, please just enjoy it. Use the extension, borrow the
setup as a starting point for your own project, or open an issue or PR if you've
got an idea or a fix. Contributions are genuinely welcome — no ceremony required.

---

_The extension is on the VS Code Marketplace, and the whole thing — specs, tests,
CI and all — is open on
[GitHub](https://github.com/samdidos/vscode-json-schema-preview)._
