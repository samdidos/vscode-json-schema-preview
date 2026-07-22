#!/usr/bin/env node
// Prose/config consistency gate — the checks that keep human-maintained
// listings from drifting behind the files they describe (the class of bug
// the 2026-07-19 doc-review found: a specs index missing four specs, and an
// exclusion list duplicated in three places with different contents).
//
// Checks:
//  1. Every spec file (specs/F*.md, specs/S*.md) is linked from the index
//     table in specs/README.md.
//  2. The per-file coverage exclusions (package.json `c8.exclude`) and the
//     mutation exclusions (stryker.config.json `mutate` `!src/...` entries)
//     name the same set of source files — one decision, two configs.
//  3. The actionlint version pinned locally (scripts/lint-workflows.sh,
//     S09-SR-06) matches the version CI's actionlint job runs
//     (.github/workflows/ci.yml, S09-SR-05) — one decision, two places.
//
// Runs inside `npm run verify` (pre-commit hook + CI). Exit 1 on drift.

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// ── 1. specs/README.md index completeness ───────────────────────────────────

const specFiles = readdirSync(join(ROOT, 'specs'))
  .filter((f) => /^[FS]\d{2}-.*\.md$/.test(f))
  .sort();
const specsReadme = readFileSync(join(ROOT, 'specs', 'README.md'), 'utf-8');
for (const file of specFiles) {
  if (!specsReadme.includes(`](${file})`)) {
    problems.push(`specs/README.md index is missing a link to ${file}`);
  }
}

// ── 2. coverage exclusions ↔ mutation exclusions ────────────────────────────
// Normalize both lists to bare module names ("SchemaEditorPanel") and compare
// as sets. Test-tree globs are structural, not per-file decisions — skipped.

// Capture the module path (minus out/-src/ prefix and extension), allowing
// subdirectories (e.g. cli/bin) but never glob patterns (the `test/**` /
// `**/*.test.ts` entries contain `*` and are structural, not per-file).
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const c8Excluded = (pkg.c8?.exclude ?? [])
  .map((e) => /^out\/([A-Za-z0-9_/]+)\.js$/.exec(e)?.[1])
  .filter(Boolean);

const stryker = JSON.parse(readFileSync(join(ROOT, 'stryker.config.json'), 'utf-8'));
const strykerExcluded = (stryker.mutate ?? [])
  .map((e) => /^!src\/([A-Za-z0-9_/]+)\.ts$/.exec(e)?.[1])
  .filter(Boolean);

for (const name of c8Excluded) {
  if (!strykerExcluded.includes(name)) {
    problems.push(
      `src/${name}.ts is excluded from coverage (package.json c8.exclude) but not from mutation (stryker.config.json mutate)`);
  }
}
for (const name of strykerExcluded) {
  if (!c8Excluded.includes(name)) {
    problems.push(
      `src/${name}.ts is excluded from mutation (stryker.config.json mutate) but not from coverage (package.json c8.exclude)`);
  }
}

// ── 3. actionlint version: local script ↔ CI container tag ─────────────────

const ciYml = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8');
const ciVersion = /docker:\/\/rhysd\/actionlint:([\d.]+)/.exec(ciYml)?.[1];

const lintWorkflowsScript = readFileSync(join(ROOT, 'scripts', 'lint-workflows.sh'), 'utf-8');
const localVersion = /^ACTIONLINT_VERSION=([\d.]+)/m.exec(lintWorkflowsScript)?.[1];

if (!ciVersion) {
  problems.push('.github/workflows/ci.yml: could not find the actionlint docker image tag (docker://rhysd/actionlint:X.Y.Z)');
} else if (!localVersion) {
  problems.push('scripts/lint-workflows.sh: could not find ACTIONLINT_VERSION=X.Y.Z');
} else if (ciVersion !== localVersion) {
  problems.push(`actionlint version drift: CI pins ${ciVersion} (ci.yml) but the local script pins ${localVersion} (scripts/lint-workflows.sh)`);
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log('Prose/config consistency');
console.log('─'.repeat(48));
console.log(`Spec files indexed    : ${specFiles.length}`);
console.log(`Coverage exclusions   : ${c8Excluded.length} (mutation: ${strykerExcluded.length})`);
console.log(`actionlint version    : ${localVersion ?? '?'} (CI: ${ciVersion ?? '?'})`);

if (problems.length) {
  console.error(`\n✗ ${problems.length} consistency problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\n✓ Consistency check passed.');
