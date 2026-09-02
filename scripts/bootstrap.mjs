#!/usr/bin/env node
// One-shot environment bootstrap for a fresh checkout or container — usable by
// any agent OR human (vendor-neutral, per AGENTS.md's agnosticity principle).
//
// Why not just `npm ci`? Some transitive dependencies build native code at
// install time — `keytar`, pulled in by `@vscode/vsce`, falls back to a
// node-gyp build when no prebuilt binary matches, which fails in minimal
// containers that lack the build toolchain. We skip *all* install scripts so
// the quality gate (lint / type-check / test / coverage / traceability) works
// everywhere, then wire up the git hooks path explicitly (skipped scripts
// mean husky's `prepare` did not run).
//
// Nothing this repo builds needs those scripts: the demo-GIF pipeline
// (`npm run make-gifs`) shells out to ffmpeg (S08-SR-17) rather than linking
// a native encoder, so a bootstrapped checkout can regenerate assets as-is.
// Only `npm run package` (vsce) wants the skipped native module.
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
