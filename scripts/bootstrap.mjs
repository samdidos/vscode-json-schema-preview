#!/usr/bin/env node
// One-shot environment bootstrap for a fresh checkout or container — usable by
// any agent OR human (vendor-neutral, per AGENTS.md's agnosticity principle).
//
// Why not just `npm ci`? The `canvas` dependency (used only by the demo-GIF
// pipeline) compiles native code with node-gyp, which fails in minimal
// containers that lack the build toolchain. We skip *all* install scripts so
// the quality gate (lint / type-check / test / coverage / traceability) works
// everywhere, then wire up the git hooks path explicitly (skipped scripts
// mean husky's `prepare` did not run).
//
// The GIF pipeline (`npm run make-gifs`) needs canvas built; run a full
// `npm install` separately if you are regenerating assets.
//
// Plain Node, no shell — S15-SR-01/02: this is the first command a
// contributor runs, so it must not assume bash (or any interpreter beyond
// Node + git) is on the machine. `shell: true` lets Node resolve npm/npx via
// their platform-native shims (`.cmd` on Windows) without hardcoding that.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('→ Installing dependencies (skipping native builds)…');
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);

console.log('→ Wiring up git hooks (husky)…');
run('npx', ['husky']);

console.log("✓ Bootstrap complete. Run 'npm run verify' to check the full gate.");
