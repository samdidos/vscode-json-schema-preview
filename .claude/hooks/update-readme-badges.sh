#!/usr/bin/env bash
# PostToolUse hook: sync README engine/node/license badges after package.json edits.
# Coverage badge is handled separately by check-coverage.sh after a test run.
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
python3 .claude/hooks/sync_badges.py || true
