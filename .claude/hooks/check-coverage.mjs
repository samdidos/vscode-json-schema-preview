#!/usr/bin/env node
// PostToolUse hook: lint + type-check after any TypeScript source file is
// edited. Deliberately fast (no test run) since this fires on every edit —
// the full coverage gate still runs at commit time via pre-commit-gate.mjs
// (git pre-commit hook -> npm run verify), so nothing is unenforced, just
// deferred to a lower-frequency trigger.
// Exit 2 → Claude sees the output as a blocking warning and must address it.
// Exit 0 → all good, continue silently.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Parse stdin JSON (PostToolUse passes tool info on stdin)
let filePath = '';
try {
  filePath = JSON.parse(readFileSync(0, 'utf-8'))?.tool_input?.file_path ?? '';
} catch {
  filePath = '';
}

// Only care about TypeScript source files outside the test tree
if (!filePath.endsWith('.ts')) process.exit(0);
if (filePath.includes('/test/') || filePath.endsWith('.test.ts')) process.exit(0);

console.error(`→ Lint/type-check triggered by: ${filePath}`);

// Fast checks only — full coverage runs at commit time instead.
const lint = spawnSync('npm', ['run', 'lint', '--silent'], { cwd: ROOT, stdio: 'inherit', shell: true });
if (lint.status === 0) {
  const typecheck = spawnSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (typecheck.status === 0) {
    console.error('✓ Lint and type-check passed.');
    process.exit(0);
  }
}

console.error('');
console.error(`✗ Lint/type-check FAILED after editing ${filePath}`);
console.error("  Run 'npm run lint' / 'npx tsc --noEmit' for details.");
process.exit(2);
