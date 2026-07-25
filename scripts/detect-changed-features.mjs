#!/usr/bin/env node
// Determines, at release time, which demos need re-running (S08-SR-12): the
// specs that changed or were newly added since the previous release tag,
// cross-referenced against scripts/demo-registry.mjs's demo <-> spec mapping
// (S08-SR-13). Mirrors scripts/ci-detect-source-changes.sh's shape (diff
// against a base, "no usable base -> run everything" fallback, GITHUB_OUTPUT
// with a stdout fallback) but for the release-tag axis instead of the PR-diff
// axis, and written in Node (not bash) since it also needs to be unit-tested
// and it isn't reached from `npm run verify`/bootstrap, so it isn't bound
// either way by S15-SR-01's mandatory-local-gate rule.
//
// Usage:
//   node scripts/detect-changed-features.mjs [--base <ref>] [--head <ref>]
//
// --base defaults to the nearest tag reachable from --head (the previous
// release); --head defaults to HEAD. Writes `all`, `demos`, `mouse-grep`,
// `smoke-grep`, and `changed-specs` to $GITHUB_OUTPUT (or stdout).
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEMOS } from './demo-registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Spec ids touched by a `git diff --name-only` listing (added or modified
 *  `specs/[FS]NN-*.md` files count the same — a rename/add is still "new"). */
export function parseChangedSpecIds(diffOutput) {
  const ids = new Set();
  for (const line of diffOutput.split('\n')) {
    const m = /^specs\/([FS]\d{2})-.*\.md$/.exec(line.trim());
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
}

/** Registry entries whose `specs` intersect the changed set. */
export function affectedDemos(changedSpecIds, demos = DEMOS) {
  const changed = new Set(changedSpecIds);
  return demos.filter((d) => d.specs.some((s) => changed.has(s)));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a Playwright --grep alternation matching only the given demo
 *  names' mouse (or non-mouse) test-title variants. Empty input -> empty
 *  string, which callers treat as "nothing to run". */
export function buildGrepPattern(names, variant) {
  if (names.length === 0) return '';
  const alt = names.map(escapeRegex).join('|');
  return variant === 'mouse' ? `demo-(${alt})-mouse:` : `demo-(${alt}):`;
}

function writeOutputs(fields) {
  const target = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  if (target) {
    appendFileSync(target, lines);
  } else {
    process.stdout.write(lines);
  }
}

function resolvePreviousTag(head) {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', head], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function diffSpecFiles(base, head) {
  return execFileSync('git', ['diff', '--name-only', base, head, '--', 'specs'], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { values: argv } = parseArgs({
    options: { base: { type: 'string' }, head: { type: 'string' } },
    strict: false,
  });
  const head = argv.head ?? 'HEAD';
  const base = argv.base ?? resolvePreviousTag(head);

  if (!base) {
    console.error('No previous release tag found — running every demo.');
    writeOutputs({ all: 'true', demos: '', 'mouse-grep': '', 'smoke-grep': '', 'changed-specs': '' });
  } else {
    const changedSpecIds = parseChangedSpecIds(diffSpecFiles(base, head));
    const affected = affectedDemos(changedSpecIds);
    const names = affected.map((d) => d.name);
    console.error(
      `Base ${base}..${head}: ${changedSpecIds.length ? changedSpecIds.join(', ') : '(no spec changes)'} ` +
      `-> ${names.length ? names.join(', ') : '(no demos affected)'}`,
    );
    writeOutputs({
      all: 'false',
      demos: names.join(','),
      'mouse-grep': buildGrepPattern(names, 'mouse'),
      'smoke-grep': buildGrepPattern(names, 'smoke'),
      'changed-specs': changedSpecIds.join(','),
    });
  }
}
