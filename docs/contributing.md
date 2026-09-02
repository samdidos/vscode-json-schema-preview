# Contributing & Engineering

This page is for people changing the extension rather than using it. It
describes the mechanics that keep the project honest: the single local gate,
how CI is scoped, what runs end to end, and why every script is plain Node.

<!-- spec:S17 start -->

## One gate: `npm run verify`

Every guarantee this project makes is enforced by one command, run by the
`pre-commit` hook and by CI alike:

```sh
npm run verify
```

It runs ten steps **concurrently** — lint, workflow lint, type-check, spec
traceability, documentation traceability, coverage/mutation exclusion
consistency, effort and value estimate validation, dependency audit, and the
test suite with coverage — and prints **one summary at the end**, with every
step's result, whether or not an earlier one failed. That last property is
deliberate: a red gate that stops at the first failure makes you fix, re-run and
discover the next one, five minutes at a time. Seeing all failures at once is
the point.

Every check that **blocks CI is also a local step** — lint, type-check, knip and
the dependency audit included. A blocking CI job missing from the local gate is
not a drift risk so much as a guaranteed round trip: you push, wait, and learn
about an unused export only then.

Pass `--fail-fast` (or run `npm run verify:fail-fast`) to cancel the remaining
steps on the first failure instead, when you want the quick answer rather than
the full picture.

<!-- spec:S17 end -->

<!-- spec:S15 start -->

## Plain Node, everywhere

Every script the local gate or the bootstrap step runs is a Node `.mjs` file. No
step assumes bash, Python, `make`, or any tool beyond Node and git — so a bare
Windows checkout runs the same gate a Linux CI runner does, and a contributor is
never blocked by a shell they don't have.

Scripts that only ever run on a CI runner (a shell step inside a workflow, say)
are exempt, because they never touch a contributor's machine. The rule bites the
moment such a script crosses into the mandatory gate: it is ported to Node
first.

The one thing that needs more than Node is regenerating the demo GIFs, which
records a real VS Code under X11 with `ffmpeg` and `xdotool` — and that runs
only in the release workflow, never locally.

<!-- spec:S15 end -->

<!-- spec:S09 start -->

## Path-scoped CI

CI is one workflow whose jobs are gated on *what changed*, not on which files
triggered the run. A first job diffs the pull request against its base and
emits two outputs — did source change, did the docs site change — and every
other job carries an `if:` on the one it cares about.

The distinction matters because a workflow-level `paths:` filter *skips the
whole run*, which leaves a required check permanently pending on a docs-only
PR. Job-level gating lets the run happen, lets the skipped jobs report as
skipped, and keeps the required checks green.

Jobs that are red for reasons unrelated to the change are made non-blocking
through branch protection, never with `continue-on-error`, so a failing job
still *shows* as failing — it just doesn't hold the merge.

<!-- spec:S09 end -->

<!-- spec:S08 start -->

## What runs end to end

Three layers, deliberately separate:

| Layer | Runs | Against |
|---|---|---|
| **Unit tests** (`npm test`) | On every commit and PR | A shared `vscode` mock; every module that isn't a webview or a subprocess |
| **Integration tests** (`npm run test:integration`) | On every PR, Linux and Windows | A real VS Code via `@vscode/test-electron`, with assertions |
| **Demo scripts** (`src/test/e2e/`) | At release time only | A real VS Code driven by Playwright, producing the demo GIFs |

The demo scripts contain no assertions — they are recordings — so they never
gate a PR. Their command-palette twins double as a crash-level smoke test of the
underlying commands. Which demos re-run at release is decided from which specs
changed since the previous tag, through the one registry that maps demos to
specs, so a release touching two features regenerates two GIFs rather than
seventeen.

Coverage is measured on the unit layer only and gated at 80% on all four axes.
The exclusion list is short and specific: webview HTML and subprocess-bound
files. Touching the `vscode` API is *not* a reason to exclude a file — the
shared mock exists precisely so it isn't.

<!-- spec:S08 end -->

## Where to start

- [`AGENTS.md`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/AGENTS.md)
  is the map: where each piece of truth lives, and the footguns that live
  nowhere else. It is written for AI coding agents and reads just as well for
  people.
- [`specs/`](/specs/) holds every requirement. A code change without a
  requirement is a docs change, a dependency bump, or CI — say which.
- [`CONTRIBUTING.md`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/CONTRIBUTING.md)
  covers the pull request flow and commit conventions.
