#!/usr/bin/env bash
# PostToolUse hook: lint + type-check after any TypeScript source file is
# edited. Deliberately fast (no test run) since this fires on every edit —
# the full coverage gate still runs at commit time via pre-commit-gate.sh
# (git pre-commit hook -> npm run verify), so nothing is unenforced, just
# deferred to a lower-frequency trigger.
# Exit 2 → Claude sees the output as a blocking warning and must address it.
# Exit 0 → all good, continue silently.

set -euo pipefail

# Parse stdin JSON (PostToolUse passes tool info on stdin)
INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
")

# Only care about TypeScript source files outside the test tree
if [[ "$FILE_PATH" != *.ts ]]; then
    exit 0
fi
if [[ "$FILE_PATH" == */test/* || "$FILE_PATH" == *.test.ts ]]; then
    exit 0
fi

# Resolve project root (two levels up from .claude/hooks/)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "→ Lint/type-check triggered by: $FILE_PATH" >&2

# Fast checks only — full coverage runs at commit time instead.
if npm run lint --silent 2>&1 && npx tsc --noEmit 2>&1; then
    echo "✓ Lint and type-check passed." >&2
    exit 0
else
    echo "" >&2
    echo "✗ Lint/type-check FAILED after editing $FILE_PATH" >&2
    echo "  Run 'npm run lint' / 'npx tsc --noEmit' for details." >&2
    exit 2
fi
