# S15 — Cross-Platform Tooling (Development & Deployment)

## Overview

This project targets contributors on Windows, macOS, and Linux alike, with no
"works on my machine" assumption about the OS or shell. The shipped extension
already has to hold to that bar — `S08-SR-09` runs the E2E suite on both
Linux and Windows CI runners, and `specs/README.md`'s Scope section makes
Python strictly optional (renderer fallback only), so nothing in the
*deployed* extension requires a specific OS or an interpreter beyond Node/VS
Code itself.

The *development* side had quietly drifted from that bar. Most of
`scripts/` is Node (`.mjs`), already portable, but a few scripts — most
recently `scripts/lint-workflows.sh`, added to close the S09-SR-06 CI/local
parity gap — are bash, and one contributor-facing script
(`scripts/bootstrap.sh`, the documented first step for any checkout) is bash
too. Both are wired into the **mandatory local gate**: `bootstrap.sh` is the
project's `npm ci` replacement, and `lint-workflows.sh` runs inside
`npm run verify`, which is the Husky pre-commit hook. Neither script runs
without a bash interpreter, which is not part of a bare Windows + Node + git
install.

This spec makes the existing product-level guarantee and the missing
tooling-level guarantee both explicit in one place, so "OS-agnostic" covers
development and deployment symmetrically, and so a future script doesn't
reintroduce the gap the way `lint-workflows.sh` did.

## Requirements

### Mandatory Local Gate

- **S15-SR-01** Every script invoked by `npm run verify` (directly or via a
  `check:*`/`lint:*`/`test:*` sub-script) MUST run on Windows, macOS, and
  Linux using only Node.js (already an `engines.node` requirement) and git —
  no bash, POSIX shell, or Python assumed, and no reliance on Git for
  Windows bundling MSYS/Git Bash as an implicit shell.
- **S15-SR-02** `scripts/bootstrap.sh` and `scripts/lint-workflows.sh` MUST
  be rewritten as Node (`.mjs`) scripts, preserving their current behavior
  exactly: `bootstrap.sh`'s `npm install --ignore-scripts --no-audit
  --no-fund` + `npx husky` sequence, and `lint-workflows.sh`'s PATH →
  `go run` → `docker run` fallback chain (in the same order, with the same
  pinned `ACTIONLINT_VERSION`) and its loud failure message when none of the
  three are available. `package.json`'s `lint:workflows` script and
  `AGENTS.md`'s bootstrap instructions MUST be updated to invoke the new
  Node entry points.
- **S15-SR-03** New scripts added under `scripts/` in the future MUST default
  to Node (`.mjs`) unless the exemption in S15-SR-04 applies. A bash or
  Python script landing in the mandatory local gate (`npm run verify`,
  `bootstrap`, or any script a contributor must run to get a working
  checkout) is a spec violation to flag in review, not a style preference.

### CI-Only Exemption

- **S15-SR-04** A script that only ever runs on the pinned GitHub-hosted
  runner image — never on a contributor's machine — is exempt from
  S15-SR-01/03 (e.g. `scripts/ci-detect-source-changes.sh`, bash;
  `scripts/sync-readme-badges.py`, python3, reached via `npm run
  badges:sync` from both `maturity-refresh.yml` and the
  `update-readme-badges` agent hook — see S15-SR-05 for why the *hook* is in
  scope even though the script it calls stays exempt). If either script is
  ever wired into `npm run verify` or another contributor-facing command, it
  MUST first be ported per S15-SR-01/02's rules before that happens.

### Agent-Invoked Hooks

- **S15-SR-05** Claude Code runs directly on a contributor's own machine as
  often as it runs in a managed container — nothing about `.claude/hooks/`
  is inherently container-only — so every script Claude Code's harness
  invokes as a hook (`.claude/settings.json`'s `SessionStart`, `PreToolUse`,
  `PostToolUse`, `UserPromptSubmit` entries) MUST be Node (`.mjs`), invoked
  via an explicit `node <path>.mjs` command rather than relying on a shebang
  and the executable bit — the latter doesn't run on Windows without a POSIX
  layer, defeating the point. `AGENTS.md`'s "guarantees live below the
  agent" rule still holds — none of these hooks becomes the sole
  enforcement of anything — but "convenience only" MUST NOT mean "broken on
  Windows"; a hook that silently never fires is a worse experience than not
  having it. A hook MAY still shell out to a script that keeps a documented
  exemption (S15-SR-04) — e.g. `update-readme-badges.mjs` calling `npm run
  badges:sync`, which reaches `sync-readme-badges.py` — as long as that
  failure path degrades gracefully (matches the pre-existing best-effort,
  never-blocks behavior) rather than breaking the hook itself.

## Non-Functional Requirements

- **S15-NFR-01** (deployment, cross-reference — no new product requirement)
  The shipped extension's OS/interpreter agnosticism is already specified
  elsewhere and this spec does not duplicate it, only points to it: the E2E
  suite runs on Linux and Windows CI runners (`S08-SR-09`), and Python is
  optional for every feature except the richer preview renderer, which falls
  back to a dependency-free built-in renderer without it
  (`specs/README.md` Scope, `F01-FR-21/22`).

## Out of Scope

- Rewriting `scripts/ci-detect-source-changes.sh` or
  `scripts/sync-readme-badges.py` — covered by the S15-SR-04 exemption as
  long as they stay CI-only/optional-convenience.
- Any change to the shipped extension's runtime behavior — this spec is
  about contributor tooling only; the product-side guarantee already exists
  (S15-NFR-01's cross-references).
- Requiring a specific package manager or shell for optional/manual
  scripts outside the local gate (e.g. `npm run make-gifs`, which already
  documents its own native-build prerequisites separately from
  `bootstrap.sh`).

## Acceptance Criteria

1. `npm run verify` and the bootstrap step succeed on a Windows runner
   (PowerShell or cmd, no WSL) with only Node ≥22 and git installed.
2. `scripts/lint-workflows.sh` and `scripts/bootstrap.sh` no longer exist;
   their Node replacements produce equivalent output and exit codes for the
   same PATH/`go`/`docker`-availability scenarios the bash versions handled.
3. `package.json` and `AGENTS.md` reference the Node entry points, not
   `bash scripts/*.sh`.
4. `npm run check:traceability` passes with S15's requirement IDs present in
   `specs/traceability.json`.
5. `.claude/hooks/*.sh` no longer exist; `.claude/settings.json`'s hook
   `command` entries invoke their `.mjs` replacements explicitly via `node`,
   and each hook's observable behavior (exit codes, stdout/stderr content,
   what triggers it) is unchanged from the bash version.

## Relation to Existing Specs

- Cross-references `S08-SR-09` (E2E suite on Linux + Windows) and
  `specs/README.md`'s Python-optional Scope note as the pre-existing
  deployment half of this guarantee — this spec is the single place that
  states "OS-agnostic, development and deployment both," rather than
  scattering the claim.
- Complements `S09-SR-06`, which added `lint-workflows.sh` to the local
  gate without noticing it introduced a new bash dependency; S15-SR-02
  is the follow-up that closes that specific regression.
- Follows `AGENTS.md`'s "Agnosticity & standardization" principle (AI-tool
  and model agnosticity) by extending the same reasoning to the OS/shell
  axis: durable guarantees should not depend on an environment detail a
  contributor might not have.

## History

- 2026-07-24 — Initial spec, prompted by `lint-workflows.sh` (S09-SR-06)
  landing as bash inside the mandatory local gate.
- 2026-07-24 — Added S15-SR-05: extended scope to `.claude/hooks/*.sh`.
  Initially left as bash on the reasoning that Claude Code sessions run in a
  managed Linux container; a contributor pointed out Claude Code also runs
  directly on a user's own machine (Windows included), where the same
  bash-shebang-doesn't-execute problem applies to hooks as much as to
  `bootstrap.sh`/`lint-workflows.sh`.
