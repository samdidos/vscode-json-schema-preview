<!--
This project is spec-driven (see specs/README.md): every code change should
trace to an RFC-2119 requirement. Fill in the sections below; delete any that
genuinely don't apply (e.g. a dependency bump has no requirement ID).
-->

## Summary

<!-- What changed, and why — 1-3 bullets. -->

-

## Requirement(s)

<!--
List the requirement ID(s) this PR implements or amends (e.g. F10-FR-04,
S03-SR-14), each with a one-line note on what changed. If this introduces a
new requirement, add it to specs/ first and run `npm run trace:init`.
No requirement applies (docs-only, dependency bump, CI/tooling)? Say so instead.
-->

-

## Test plan

- [ ] `npm run verify` passes (lint + type-check + traceability + coverage ≥ 80%)
- [ ] `npm run check:traceability` — new/changed requirements have a matrix
      entry and `[ID]`-tagged tests (or are marked `manual` with a reason)
- [ ] Manually exercised the change (describe how, if not covered by the above)
