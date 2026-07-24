#!/usr/bin/env node
// S09-SR-05/06 — statically lint .github/workflows/*.yml with actionlint,
// locally (this script, wired into `npm run verify`) and in CI
// (.github/workflows/ci.yml's `actionlint` job). Both MUST pin the identical
// version — checked by `npm run check:consistency` — so a workflow bug caught
// in CI would always have been caught here first.
//
// No single install method works on every contributor machine, so this tries,
// in order:
//   1. `actionlint` already on PATH (fastest — nothing to fetch).
//   2. `go run` a pinned version (Go module proxy fetch, cached after first
//      run; no lingering install).
//   3. `docker run` the exact image/tag CI uses.
// and fails loudly with install pointers if none of those are available —
// this check is part of the hard local gate (`npm run verify`), not an
// optional convenience, so it must not silently no-op.
//
// Plain Node, no shell — S15-SR-01/02: the mandatory local gate must not
// assume bash (or any interpreter beyond Node + git) is on the machine.

import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep this in lockstep with the `docker://rhysd/actionlint:X.Y.Z` tag in
// .github/workflows/ci.yml's actionlint job — check:consistency enforces it.
const ACTIONLINT_VERSION = '1.7.11';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function commandExists(cmd) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        accessSync(join(dir, cmd + ext), constants.X_OK);
        return true;
      } catch {
        // not here, keep looking
      }
    }
  }
  return false;
}

/** Runs cmd with args, replacing this process's exit code with its own. */
function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

if (commandExists('actionlint')) {
  run('actionlint', ['-color']);
}

if (commandExists('go')) {
  run('go', ['run', `github.com/rhysd/actionlint/cmd/actionlint@v${ACTIONLINT_VERSION}`, '-color']);
}

if (commandExists('docker')) {
  run('docker', [
    'run', '--rm',
    '-v', `${ROOT}:/repo`,
    '--workdir', '/repo',
    `rhysd/actionlint:${ACTIONLINT_VERSION}`,
    '-color',
  ]);
}

console.error(`lint:workflows needs one of: actionlint on PATH, Go, or Docker — none found.

  - actionlint: https://github.com/rhysd/actionlint/releases (or a package
    manager, e.g. \`brew install actionlint\`)
  - Go:         https://go.dev/dl/  (then this script runs it with no install
                 step, via \`go run\`)
  - Docker:     https://docs.docker.com/get-docker/

This check is part of \`npm run verify\` (S09-SR-06) — CI enforces it
regardless, but install one of the above to catch workflow bugs locally.`);
process.exit(1);
