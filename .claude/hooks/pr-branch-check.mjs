#!/usr/bin/env node
// SessionStart hook: on a non-default branch, remind the agent that if this
// branch has an open PR, it MUST be kept rebased on the default branch with
// its checks green before the work is considered done.
//
// Convenience layer only — it injects context (git-only, no GitHub API call,
// so it works offline and needs no token); the agent uses whatever PR/CI
// tooling is available in-session (GitHub MCP tools, subscribe_pr_activity,
// or `gh`/git for any other harness) to actually check and fix the PR. The
// real guarantees ("mergeable", "checks pass") still live on GitHub itself,
// not in this hook — see AGENTS.md's "guarantees live below the agent" rule.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf-8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (!branch || branch === 'HEAD') {
  process.exit(0); // detached HEAD, nothing to check
}

// Resolve the default branch from origin/HEAD, falling back to 'main'.
const originHead = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
const defaultBranch = originHead ? originHead.replace(/^origin\//, '') : 'main';

if (branch === defaultBranch) {
  process.exit(0); // working directly on the default branch, no PR to babysit
}

// Best-effort: refresh knowledge of the default branch before comparing.
// Silent on failure (offline sandbox, no network) — the reminder still fires.
spawnSync('git', ['fetch', 'origin', defaultBranch], { cwd: ROOT, stdio: 'ignore' });

const behind = git(['rev-list', '--count', `HEAD..origin/${defaultBranch}`]);
const behindNote =
  behind && Number(behind) > 0
    ? `This branch is ${behind} commit(s) behind origin/${defaultBranch} — it likely needs a rebase.`
    : `This branch appears up to date with origin/${defaultBranch} (or the check was inconclusive offline).`;

console.log(`[pr-check] You're on branch "${branch}", not ${defaultBranch}.
${behindNote}
If this branch has an open pull request:
1. Rebase it onto origin/${defaultBranch} (not merge) and resolve any conflicts,
   then force-push with --force-with-lease.
2. Check the PR's CI status (GitHub MCP tools: pull_request_read / get_check_run,
   or subscribe with subscribe_pr_activity) and fix any failing checks.
3. Don't consider the PR done while it's unrebased or red.
If there's no open PR for this branch yet, ignore this reminder.`);
process.exit(0);
