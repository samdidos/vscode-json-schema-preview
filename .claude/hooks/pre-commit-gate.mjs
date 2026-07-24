#!/usr/bin/env node
// PreToolUse(Bash) hook: before the agent runs `git commit`, run the project's
// git pre-commit hook so the same gate CI and a human committer hit is enforced
// in-session too. It delegates to `git hook run pre-commit` — a vendor-neutral
// git command — so the check logic lives in exactly one place (.husky/pre-commit)
// and this hook stays portable across any agent harness.
// Exit 2 → Claude sees the failure and must fix it before the commit proceeds.
// Exit 0 → not a commit (or --no-verify), continue silently.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cmd = '';
try {
  cmd = JSON.parse(readFileSync(0, 'utf-8'))?.tool_input?.command ?? '';
} catch {
  cmd = '';
}

// Only gate real commits; honour an explicit --no-verify bypass.
if (!cmd.includes('git commit') || cmd.includes('--no-verify')) {
  process.exit(0);
}

console.error('→ Running git pre-commit gate before commit…');
const result = spawnSync('git', ['hook', 'run', 'pre-commit'], { cwd: ROOT, stdio: 'inherit' });
if (result.status === 0) {
  process.exit(0);
}
console.error('');
console.error('✗ pre-commit gate failed — fix it before committing');
console.error('  (or pass --no-verify to bypass intentionally).');
process.exit(2);
