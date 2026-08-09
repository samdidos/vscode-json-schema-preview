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
//   node scripts/detect-changed-features.mjs --force <name,name|all>
//
// --base defaults to the nearest tag reachable from --head (the previous
// release); --head defaults to HEAD. Writes `all`, `demos`, `mouse-grep`,
// `smoke-grep`, and `changed-specs` to $GITHUB_OUTPUT (or stdout).
//
// --force (or the FORCE_DEMOS env var, which --force takes priority over)
// is a manual override (S08-SR-15) for a change that doesn't touch any
// mapped spec file — e.g. a demo script/History-only edit — and so produces
// no spec-diff signal: `all` runs every demo, a comma-separated list of
// demo names runs only those, bypassing the base-tag diff entirely. An
// unrecognised name exits non-zero rather than silently narrowing the run.
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

/**
 * Parses a manual `demos` workflow_dispatch override (S08-SR-15): the
 * literal `all` selects every demo regardless of spec diff; a comma-
 * separated list selects exactly those demos by name. An empty/whitespace-
 * only input means "no override" (`null`), so the caller falls through to
 * S08-SR-12's normal base-diff selection. An unrecognised name throws,
 * rather than silently narrowing the run to whatever *did* match.
 */
export function resolveForceOverride(forceInput, demos = DEMOS) {
  const trimmed = (forceInput ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'all') return { all: true, demos: [] };

  const names = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  const known = new Set(demos.map((d) => d.name));
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length) {
    throw new Error(
      `Unknown demo name(s) in the "demos" override: ${unknown.join(', ')}. ` +
      `Valid names: ${[...known].sort().join(', ')}.`
    );
  }
  return { all: false, demos: demos.filter((d) => names.includes(d.name)) };
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
    options: { base: { type: 'string' }, head: { type: 'string' }, force: { type: 'string' } },
    strict: false,
  });
  const head = argv.head ?? 'HEAD';

  // S08-SR-15 — a manual workflow_dispatch override takes priority over the
  // usual base-tag diff and short-circuits it entirely; --force wins over
  // FORCE_DEMOS so a local `--force` call isn't silently overridden by a
  // leftover env var.
  let override;
  try {
    override = resolveForceOverride(argv.force ?? process.env.FORCE_DEMOS ?? '');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (override) {
    if (override.all) {
      console.error('Manual override: demos=all -> running every demo.');
      writeOutputs({ all: 'true', demos: '', 'mouse-grep': '', 'smoke-grep': '', 'changed-specs': '' });
    } else {
      const names = override.demos.map((d) => d.name);
      console.error(`Manual override: demos=${names.join(',')} -> running only these demos.`);
      writeOutputs({
        all: 'false',
        demos: names.join(','),
        'mouse-grep': buildGrepPattern(names, 'mouse'),
        'smoke-grep': buildGrepPattern(names, 'smoke'),
        'changed-specs': '',
      });
    }
  } else {
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
}
