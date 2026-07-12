#!/usr/bin/env bash
# Determines whether a push/PR diff touches source-relevant paths (S09-SR-02),
# shared by ci.yml's and codeql.yml's `changes` jobs so the path set is
# defined exactly once.
#
# Reads BASE_SHA (empty/unresolvable = "no usable base, run everything") and
# HEAD_SHA (defaults to $GITHUB_SHA) from the environment. Writes `src=true`
# or `src=false` as a step output to $GITHUB_OUTPUT (falls back to stdout so
# this is runnable locally for testing).
set -euo pipefail

PATTERN='^(src/|scripts/|package(-lock)?\.json$|webpack\.config\.js$|tsconfig[^/]*\.json$|eslint\.config\.js$|knip\.json$|stryker\.config\.json$|commitlint\.config\.js$|playwright\.e2e\.config\.ts$|\.github/workflows/)'

HEAD_SHA="${HEAD_SHA:-${GITHUB_SHA:-HEAD}}"

result=true
if [ -n "${BASE_SHA:-}" ] && git cat-file -e "$BASE_SHA" 2>/dev/null; then
  if git diff --name-only "$BASE_SHA" "$HEAD_SHA" | grep -qE "$PATTERN"; then
    result=true
  else
    result=false
  fi
else
  echo "No usable base commit (new branch/history rewrite) — running everything." >&2
fi

echo "src=$result" >> "${GITHUB_OUTPUT:-/dev/stdout}"
