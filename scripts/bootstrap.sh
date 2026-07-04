#!/usr/bin/env bash
# One-shot environment bootstrap for a fresh checkout or container — usable by
# any agent OR human (vendor-neutral, per AGENTS.md's agnosticity principle).
#
# Why not just `npm ci`? The `canvas` dependency (used only by the demo-GIF
# pipeline) compiles native code with node-gyp, which fails in minimal
# containers that lack the build toolchain. We skip *all* install scripts so the
# quality gate (lint / type-check / test / coverage / traceability) works
# everywhere, then wire up the git hooks path explicitly (skipped scripts mean
# husky's `prepare` did not run).
#
# The GIF pipeline (`npm run make-gifs`) needs canvas built; run a full
# `npm install` separately if you are regenerating assets.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "→ Installing dependencies (skipping native builds)…"
npm install --ignore-scripts --no-audit --no-fund

echo "→ Wiring up git hooks (husky)…"
npx husky

echo "✓ Bootstrap complete. Run 'npm run verify' to check the full gate."
