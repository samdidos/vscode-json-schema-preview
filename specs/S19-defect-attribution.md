# S19 — Defect Attribution

## Overview

The repository knows which commits are fixes — Conventional Commits marks them
`fix:` and commitlint already enforces the format. What it does not know is
**what they fixed**. Without that, "which requirements actually break?" is
unanswerable, and the question matters more here than in most projects: every
requirement carries an advisory value estimate (S16) and an effort estimate
(S13), so pairing defects with those numbers is the difference between "we
believe this is important" and "this is important and it keeps breaking".

Attributing a fix by **intersecting its changed files with the matrix's `impl`
paths does not work**, and this was measured before being rejected: all 8 fix
commits in the history attribute to at least one spec, but they spray across
**29 specs**, because a fix touching a widely-claimed file like
`src/extension.ts` lands on every spec that lists it. The resulting count
correlates 0.89 with raw commit churn — that is the file-sharing artifact, not
a defect signal.

The fix is one line of metadata the author already knows at commit time: a
`Fixes:` git trailer naming the requirement(s) repaired.

```
fix(auth): treat an unauthenticated GitHub 404 as auth-required

Fixes: F07-FR-03
```

## User Stories

- As a maintainer, I want to know which requirements generate the most fixes,
  so I can aim tests and review effort at what actually breaks.
- As a maintainer, I want defect counts next to the value estimate, so I can
  tell an important-and-fragile feature from an important-and-solid one.
- As a contributor, I want the commit hook to tell me immediately that I named
  a requirement that does not exist, rather than silently recording a typo.

## Functional Requirements

- **S19-SR-01** A `fix:` commit MUST carry at least one `Fixes:` git trailer
  naming the requirement ID(s) it repairs, comma-separated where a fix repairs
  more than one (`Fixes: F07-FR-03, F07-FR-04`). Every ID named MUST exist in
  `specs/traceability.json`.
- **S19-SR-02** The rule MUST be enforced by the `commit-msg` git hook — the
  same hook commitlint already runs — so it fires for any agent or human on
  the commit itself, and MUST reject: a `fix:` commit with no trailer, a
  malformed ID, and an ID absent from the matrix.
- **S19-SR-03** Commits with scope **`deps`** (`fix(deps): …`) MUST be exempt:
  a dependency advisory patch repairs no requirement of this project, and the
  supply chain is already gated by `npm run check:audit` and the Snyk and
  Scorecard workflows. No other scope is exempt.

  A fix that repairs behaviour no requirement describes MUST NOT be waved
  through with an escape hatch. Under constitution Article IV behaviour is
  specified before it is built, so an unattributable fix means the behaviour
  was never specified — the requirement is written first, and the fix then
  names it. The friction is the point.
- **S19-SR-04** Defect counts MUST be derived at **build time from `git log`**,
  never from a committed list: the trailers in the history are the record, and
  a hand-maintained tally could disagree with them. Attribution is per
  requirement; a per-spec count is the sum over that spec's requirements.
- **S19-SR-05** Fix commits predating this convention MUST be reported as
  **unattributed** and counted separately, never guessed at. The file-based
  attribution described above is precisely the guess this requirement forbids,
  and a surface showing defect counts MUST disclose how many fixes are
  unattributed so a small count is not mistaken for a healthy one.

## Non-Functional Requirements

- **S19-NFR-01** The hook check MUST be plain Node with no third-party
  dependencies (S15), so a bare Windows checkout enforces it too.
- **S19-NFR-02** The check MUST read only the commit message and the matrix —
  never the working tree or the diff — so it behaves identically on a commit,
  an amend, and a rebase.

## Out of Scope

- Severity or priority of a defect; the trailer records attribution only.
- Attributing defects found but not yet fixed — the trailer rides the fix, so
  an open bug is invisible here until it is repaired.
- Retrofitting trailers onto existing history (S19-SR-05), including by
  rewriting commits: the attribution genuinely is not known, and inventing it
  would poison the one honest signal this spec adds.
- Linking to an issue tracker; `Fixes:` names a requirement, not an issue.

## Acceptance Criteria

1. Committing `fix: something` with no `Fixes:` trailer is rejected by the
   `commit-msg` hook; adding `Fixes: F07-FR-03` lets it through.
2. `Fixes: F99-FR-01` (no such requirement) and `Fixes: nonsense` are both
   rejected with a message naming the offending value.
3. `fix(deps): …` commits pass with no trailer; `fix(auth): …` does not.
4. A non-`fix` commit (`feat:`, `chore:`) is unaffected whether or not it
   carries a trailer.
5. The docs site's defect figures come from `git log` at build time, change
   when a new attributed fix is committed, and state how many fix commits
   predate the convention.

## History

- 2026-07-26 — Created after testing file-intersection attribution on the real
  history and rejecting it: 8 fix commits attributed to 29 specs, correlating
  0.89 with commit churn because fixes touch widely-shared files. The trailer
  records what the author already knows instead of inferring what the files
  cannot say.
