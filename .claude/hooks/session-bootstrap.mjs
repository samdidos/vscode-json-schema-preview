#!/usr/bin/env node
// SessionStart hook: make a fresh remote/web session start green.
//
// Convenience layer only — it just guards and delegates to the vendor-neutral
// scripts/bootstrap.mjs so the actual install logic lives in exactly one place
// (any agent or human can run that script directly). Warm sessions where
// dependencies are already present exit instantly so we never re-install.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Already bootstrapped? A resolved local eslint binary is a cheap proxy for
// "dependencies installed", so this is a no-op on every warm session.
if (existsSync(join(ROOT, 'node_modules', '.bin', 'eslint'))) {
  process.exit(0);
}

console.error('→ First run in this environment — bootstrapping dependencies…');
const result = spawnSync(process.execPath, [join('scripts', 'bootstrap.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (result.status === 0) {
  console.error('✓ Environment ready.');
} else {
  console.error("✗ Bootstrap failed — run 'node scripts/bootstrap.mjs' manually.");
}
process.exit(0);
