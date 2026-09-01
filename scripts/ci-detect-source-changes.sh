#!/usr/bin/env bash
# Determines whether a push/PR diff touches source-relevant paths (S09-SR-02)
# and/or docs/** paths (S09-SR-09), shared by ci.yml's and codeql.yml's
# `changes` jobs so each path set is defined exactly once.
#
# Reads BASE_SHA (empty/unresolvable = "no usable base, run everything") and
# HEAD_SHA (defaults to $GITHUB_SHA) from the environment. Writes `src=true`
# or `src=false`, and `docs=true`/`docs=false`, as step outputs to
# $GITHUB_OUTPUT (falls back to stdout so this is runnable locally for
# testing).
set -euo pipefail

SRC_PATTERN='^(src/|scripts/|package(-lock)?\.json$|webpack\.config\.js$|tsconfig[^/]*\.json$|eslint\.config\.js$|knip\.json$|stryker\.config\.json$|commitlint\.config\.js$|playwright\.e2e\.config\.ts$|\.github/workflows/)'
DOCS_PATTERN='^docs/'

HEAD_SHA="${HEAD_SHA:-${GITHUB_SHA:-HEAD}}"

src_result=true
docs_result=true
if [ -n "${BASE_SHA:-}" ] && git cat-file -e "$BASE_SHA" 2>/dev/null; then
  changed="$(git diff --name-only "$BASE_SHA" "$HEAD_SHA")"

  if grep -qE "$SRC_PATTERN" <<<"$changed"; then
    src_result=true
  else
    src_result=false
  fi

  if grep -qE "$DOCS_PATTERN" <<<"$changed"; then
    docs_result=true
  else
    docs_result=false
  fi
else
  echo "No usable base commit (new branch/history rewrite) — running everything." >&2
fi

{
  echo "src=$src_result"
  echo "docs=$docs_result"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
