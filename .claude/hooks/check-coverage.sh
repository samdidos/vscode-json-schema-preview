#!/usr/bin/env bash
# PostToolUse hook: re-run coverage after any TypeScript source file is edited.
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

echo "→ Coverage check triggered by: $FILE_PATH" >&2

# Run the full coverage gate
if npm run test:coverage --silent 2>&1; then
    echo "✓ Coverage thresholds met." >&2
    exit 0
else
    echo "" >&2
    echo "✗ Coverage check FAILED after editing $FILE_PATH" >&2
    echo "  Run 'npm run test:coverage' for details." >&2
    echo "  Fix coverage or ask the user to explicitly approve skipping it." >&2
    exit 2
fi
