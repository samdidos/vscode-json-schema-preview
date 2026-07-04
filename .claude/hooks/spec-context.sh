#!/usr/bin/env bash
# UserPromptSubmit hook: inject the spec-driven workflow into every prompt so
# code-change requests are checked against specs/ before implementation.
# Exit 0 → stdout is added to the prompt's context.
#
# This is a *convenience* layer (it only runs inside Claude Code); the
# enforced guarantee is `npm run check:traceability`, which runs inside
# `npm run verify` and therefore fires for any agent or human via the git
# pre-commit hook and CI.

set -euo pipefail

cat <<'EOF'
[spec-gate] This project is spec-driven: RFC-2119 requirements live in specs/
(index: specs/README.md; machine-readable matrix: specs/traceability.json).
If this prompt asks for a code change:
1. Before writing code, find the requirement(s) covering the change in
   specs/F*.md / specs/S*.md and follow them.
2. If no requirement covers it, add or amend the spec first (constitution
   Article IV: features MUST be specified before implementation), then run
   `npm run trace:init` and set the new IDs' status in traceability.json.
3. After implementing, update the requirement's status and impl paths in
   specs/traceability.json and tag the covering tests with [ID] in their titles.
4. `npm run check:traceability` must pass — it runs inside `npm run verify`
   (git pre-commit hook and CI), so drift blocks the commit.
If this prompt is a question or a non-code task, ignore this reminder.
EOF
