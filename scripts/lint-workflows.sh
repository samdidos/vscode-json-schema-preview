#!/usr/bin/env bash
# S09-SR-05/06 — statically lint .github/workflows/*.yml with actionlint,
# locally (this script, wired into `npm run verify`) and in CI
# (.github/workflows/ci.yml's `actionlint` job). Both MUST pin the identical
# version — checked by `npm run check:consistency` — so a workflow bug caught
# in CI would always have been caught here first.
#
# No single install method works on every contributor machine, so this tries,
# in order:
#   1. `actionlint` already on PATH (fastest — nothing to fetch).
#   2. `go run` a pinned version (Go module proxy fetch, cached after first
#      run; no lingering install).
#   3. `docker run` the exact image/tag CI uses.
# and fails loudly with install pointers if none of those are available —
# this check is part of the hard local gate (`npm run verify`), not an
# optional convenience, so it must not silently no-op.
set -euo pipefail

# Keep this in lockstep with the `docker://rhysd/actionlint:X.Y.Z` tag in
# .github/workflows/ci.yml's actionlint job — check:consistency enforces it.
ACTIONLINT_VERSION=1.7.11

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" # actionlint auto-discovers .github/workflows/*.yml from cwd

if command -v actionlint >/dev/null 2>&1; then
  exec actionlint -color
fi

if command -v go >/dev/null 2>&1; then
  exec go run "github.com/rhysd/actionlint/cmd/actionlint@v${ACTIONLINT_VERSION}" -color
fi

if command -v docker >/dev/null 2>&1; then
  exec docker run --rm -v "${ROOT_DIR}:/repo" --workdir /repo \
    "rhysd/actionlint:${ACTIONLINT_VERSION}" -color
fi

cat >&2 <<EOF
lint:workflows needs one of: actionlint on PATH, Go, or Docker — none found.

  - actionlint: https://github.com/rhysd/actionlint/releases (or a package
    manager, e.g. \`brew install actionlint\`)
  - Go:         https://go.dev/dl/  (then this script runs it with no install
                 step, via \`go run\`)
  - Docker:     https://docs.docker.com/get-docker/

This check is part of \`npm run verify\` (S09-SR-06) — CI enforces it
regardless, but install one of the above to catch workflow bugs locally.
EOF
exit 1
