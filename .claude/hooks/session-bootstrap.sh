#!/usr/bin/env bash
# SessionStart hook: make a fresh remote/web session start green.
#
# Convenience layer only — it just guards and delegates to the vendor-neutral
# scripts/bootstrap.mjs so the actual install logic lives in exactly one place
# (any agent or human can run that script directly). Warm sessions where
# dependencies are already present exit instantly so we never re-install.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Already bootstrapped? A resolved local eslint binary is a cheap proxy for
# "dependencies installed", so this is a no-op on every warm session.
if [ -x node_modules/.bin/eslint ]; then
  exit 0
fi

echo "→ First run in this environment — bootstrapping dependencies…" >&2
if node scripts/bootstrap.mjs >&2; then
  echo "✓ Environment ready." >&2
else
  echo "✗ Bootstrap failed — run 'node scripts/bootstrap.mjs' manually." >&2
fi
exit 0
