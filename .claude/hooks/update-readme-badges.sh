#!/usr/bin/env bash
# PostToolUse hook: sync README engine/node/license badges after package.json edits.
# Thin convenience wrapper — the actual logic lives in scripts/sync-readme-badges.py
# and is reached via `npm run badges:sync`, the same command CI uses (the coverage
# badge is refreshed and committed by .github/workflows/maturity-refresh.yml, so
# it's a real pipeline guarantee, not only synced when an agent runs).
# Exit 0 always — badge sync is best-effort, never blocks a save.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
")

if [[ "$FILE_PATH" != */package.json ]]; then
    exit 0
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "→ Badge sync triggered by: $FILE_PATH" >&2
npm run --silent badges:sync || true
