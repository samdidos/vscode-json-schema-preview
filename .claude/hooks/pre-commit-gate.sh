#!/usr/bin/env bash
# PreToolUse(Bash) hook: before the agent runs `git commit`, run the project's
# git pre-commit hook so the same gate CI and a human committer hit is enforced
# in-session too. It delegates to `git hook run pre-commit` — a vendor-neutral
# git command — so the check logic lives in exactly one place (.husky/pre-commit)
# and this hook stays portable across any agent harness.
# Exit 2 → Claude sees the failure and must fix it before the commit proceeds.
# Exit 0 → not a commit (or --no-verify), continue silently.

set -euo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
")

# Only gate real commits; honour an explicit --no-verify bypass.
case "$CMD" in
  *"git commit"*)
    if printf '%s' "$CMD" | grep -q -- '--no-verify'; then
      exit 0
    fi
    ;;
  *)
    exit 0
    ;;
esac

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "→ Running git pre-commit gate before commit…" >&2
if git hook run pre-commit >&2; then
  exit 0
else
  echo "" >&2
  echo "✗ pre-commit gate failed — fix it before committing" >&2
  echo "  (or pass --no-verify to bypass intentionally)." >&2
  exit 2
fi
