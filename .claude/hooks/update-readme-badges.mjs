#!/usr/bin/env node
// PostToolUse hook: sync README engine/node/license badges after package.json edits.
// Thin convenience wrapper — the actual logic lives in scripts/sync-readme-badges.py
// and is reached via `npm run badges:sync`, the same command CI uses (the coverage
// badge is refreshed and committed by .github/workflows/maturity-refresh.yml, so
// it's a real pipeline guarantee, not only synced when an agent runs).
// Exit 0 always — badge sync is best-effort, never blocks a save.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let filePath = '';
try {
  filePath = JSON.parse(readFileSync(0, 'utf-8'))?.tool_input?.file_path ?? '';
} catch {
  filePath = '';
}

if (!filePath.endsWith('/package.json')) process.exit(0);

console.error(`→ Badge sync triggered by: ${filePath}`);
spawnSync('npm', ['run', '--silent', 'badges:sync'], { cwd: ROOT, stdio: 'inherit', shell: true });
process.exit(0);
