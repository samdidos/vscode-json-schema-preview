#!/usr/bin/env node
// Automated project-maturity scorer.
//
// Every dimension is a list of checks, and every check reads an OBSERVABLE FACT
// from the repository — coverage numbers, workflow config, the traceability
// matrix, file presence, lint output — never a human judgement. A dimension's
// score is 5 × (points earned / points possible); the overall score is the mean
// of the dimension scores. This is deliberately a *self-relative* rubric (it
// tracks this repo's trend over time), not a certification — where an external
// standard exists and fits (SHA-pinned actions, CodeQL/Scorecard/SLSA presence,
// coverage), the check reads that signal directly.
//
// Usage:
//   node scripts/maturity-score.mjs            compute, write maturity-score.json, print
//   node scripts/maturity-score.mjs --check    recompute and fail (exit 1) if the
//                                              committed maturity-score.json is stale
//
// The Testing dimension reads coverage/coverage-summary.json (c8's json-summary
// reporter), so run `npm test` first — otherwise that dimension scores 0 with a
// warning.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'maturity-score.json');
const DOC_PATH = join(ROOT, 'MATURITY.md');
const MAX = 5;

// ── fact helpers (all read-only, offline) ──────────────────────────────────

const abs = (p) => join(ROOT, p);
const exists = (p) => existsSync(abs(p));
const read = (p) => { try { return readFileSync(abs(p), 'utf-8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return undefined; } };
const has = (p, re) => re.test(read(p));

function listFiles(dir, filter, acc = []) {
  const full = abs(dir);
  if (!existsSync(full)) return acc;
  for (const name of readdirSync(full)) {
    const rel = join(dir, name);
    if (statSync(abs(rel)).isDirectory()) listFiles(rel, filter, acc);
    else if (filter(rel)) acc.push(rel);
  }
  return acc;
}

/** Exit code 0 → true. Used for gate checks that already have their own script. */
function commandSucceeds(cmd) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

// ── shared derived facts ────────────────────────────────────────────────────

function traceabilityCounts() {
  const m = readJson('specs/traceability.json')?.requirements ?? {};
  const by = {};
  for (const e of Object.values(m)) by[e.status] = (by[e.status] ?? 0) + 1;
  const total = Object.keys(m).length || 1;
  return { by, total, untracked: by.untracked ?? 0 };
}

function coverage() {
  const c = readJson('coverage/coverage-summary.json');
  if (!c?.total) return undefined;
  return {
    lines: c.total.lines.pct,
    statements: c.total.statements.pct,
    functions: c.total.functions.pct,
    branches: c.total.branches.pct,
  };
}

function workflowFiles() {
  return listFiles('.github/workflows', (f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

function actionPinRatio() {
  let pinned = 0;
  let external = 0;
  for (const f of workflowFiles()) {
    const text = read(f);
    for (const m of text.matchAll(/uses:\s*([^\s]+)/g)) {
      const ref = m[1];
      if (ref.startsWith('./') || ref.startsWith('docker://')) continue; // local / not a pinnable action ref
      external++;
      if (/@[0-9a-f]{40}$/.test(ref)) pinned++;
    }
  }
  return external === 0 ? 1 : pinned / external;
}

function lintCounts() {
  try {
    const out = execSync('npx eslint --format json', { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const results = JSON.parse(out);
    let errors = 0;
    let warnings = 0;
    for (const r of results) { errors += r.errorCount; warnings += r.warningCount; }
    return { errors, warnings, ran: true };
  } catch (e) {
    // eslint exits non-zero when there are errors; it still printed JSON on stdout.
    try {
      const results = JSON.parse(e.stdout ?? '[]');
      let errors = 0;
      let warnings = 0;
      for (const r of results) { errors += r.errorCount; warnings += r.warningCount; }
      return { errors, warnings, ran: true };
    } catch {
      return { errors: 0, warnings: 0, ran: false };
    }
  }
}

function srcExclusionRatio() {
  const src = listFiles('src', (f) => f.endsWith('.ts') && !f.includes('/test/') && !f.endsWith('.test.ts'));
  const excluded = (readJson('package.json')?.c8?.exclude ?? []).filter((e) => /^out\/[^/]+\.js$/.test(e));
  const total = src.length || 1;
  return { excluded: excluded.length, total, ratio: excluded.length / total };
}

// ── the rubric ──────────────────────────────────────────────────────────────
// Each check: { id, points, earn } where earn() returns a fraction 0..1 of its
// points (a boolean is coerced). `note` documents the fact it reads. An optional
// `skip()` returning true drops the check from BOTH earned and possible (used
// for the OpenSSF grade, which only counts when its offline cache is present).

const warnings = [];

const DIMENSIONS = [
  {
    label: 'Spec & process',
    checks: [
      { id: 'traceability-passes', points: 4, note: 'npm run check:traceability exits 0',
        earn: () => commandSucceeds('node scripts/check-traceability.mjs') },
      { id: 'zero-untracked', points: 2, note: 'no requirement left untracked',
        earn: () => traceabilityCounts().untracked === 0 },
      { id: 'verify-runs-traceability', points: 2, note: 'the local/CI gate runs check:traceability',
        earn: () => /check:traceability/.test(readJson('package.json')?.scripts?.verify ?? '') },
      { id: 'constitution-present', points: 1, note: '.specify/memory/constitution.md exists',
        earn: () => exists('.specify/memory/constitution.md') },
      { id: 'specs-present', points: 1, note: '≥ 10 requirement spec files',
        earn: () => listFiles('specs', (f) => /\/[FS]\d\d.*\.md$/.test(f)).length >= 10 },
    ],
  },
  {
    label: 'Testing',
    checks: [
      { id: 'branch-coverage', points: 3, note: 'branch coverage vs a 95% target',
        earn: () => { const c = coverage(); if (!c) { warnings.push('coverage-summary.json missing — run npm test'); return 0; } return clamp01(c.branches / 95); } },
      { id: 'line-coverage', points: 2, note: 'line coverage vs a 95% target',
        earn: () => { const c = coverage(); return c ? clamp01(c.lines / 95) : 0; } },
      { id: 'function-coverage', points: 1, note: 'function coverage vs a 95% target',
        earn: () => { const c = coverage(); return c ? clamp01(c.functions / 95) : 0; } },
      { id: 'mutation-gate', points: 2, note: 'stryker break threshold is set (not null)',
        earn: () => readJson('stryker.config.json')?.thresholds?.break != null },
      { id: 'low-exclusion', points: 2, note: 'few source files excluded from coverage',
        earn: () => 1 - srcExclusionRatio().ratio },
    ],
  },
  {
    label: 'Security / supply chain',
    checks: [
      { id: 'codeql', points: 2, note: 'CodeQL workflow present',
        earn: () => exists('.github/workflows/codeql.yml') },
      { id: 'scorecard', points: 2, note: 'OpenSSF Scorecard workflow present',
        earn: () => exists('.github/workflows/scorecard.yml') },
      { id: 'dependabot', points: 1, note: 'Dependabot configured',
        earn: () => exists('.github/dependabot.yml') },
      { id: 'slsa-provenance', points: 2, note: 'SLSA build provenance attested for the release artifact',
        earn: () => workflowFiles().some((f) => /provenance|slsa|attest/i.test(read(f))) },
      { id: 'pinned-actions', points: 3, note: 'GitHub Actions pinned to a full commit SHA',
        earn: () => actionPinRatio() },
      { id: 'ossf-scorecard-grade', points: 4,
        note: 'live OpenSSF Scorecard grade /10 (offline cache; refresh with npm run maturity:ossf)',
        skip: () => { const c = readJson('ossf-scorecard.json'); return c == null || typeof c.score !== 'number'; },
        earn: () => clamp01((readJson('ossf-scorecard.json')?.score ?? 0) / 10) },
    ],
  },
  {
    label: 'CI/CD & release',
    checks: [
      { id: 'ci-present', points: 1, note: 'a CI workflow exists',
        earn: () => exists('.github/workflows/ci.yml') },
      { id: 'no-continue-on-error', points: 2, note: 'no CI job silently swallows failures',
        earn: () => !workflowFiles().some((f) => /continue-on-error:\s*true/.test(read(f))) },
      { id: 'release-automation', points: 2, note: 'release-please configured',
        earn: () => exists('.github/workflows/release-please.yml') },
      { id: 'conventional-commits', points: 2, note: 'commitlint + commit-msg hook enforce Conventional Commits',
        earn: () => exists('commitlint.config.js') && exists('.husky/commit-msg') },
      { id: 'precommit-gate', points: 2, note: 'a pre-commit hook runs the verify gate',
        earn: () => has('.husky/pre-commit', /verify/) },
      { id: 'knip-in-ci', points: 1, note: 'dead-code analysis runs in CI',
        earn: () => has('.github/workflows/ci.yml', /knip/) },
    ],
  },
  {
    label: 'Docs',
    checks: [
      { id: 'readme', points: 1, note: 'README.md', earn: () => exists('README.md') },
      { id: 'contributing', points: 1, note: 'CONTRIBUTING.md', earn: () => exists('CONTRIBUTING.md') },
      { id: 'code-of-conduct', points: 1, note: 'CODE_OF_CONDUCT.md', earn: () => exists('CODE_OF_CONDUCT.md') },
      { id: 'security-policy', points: 1, note: 'SECURITY.md', earn: () => exists('SECURITY.md') },
      { id: 'license', points: 1, note: 'LICENSE.md', earn: () => exists('LICENSE.md') },
      { id: 'docs-site', points: 1, note: 'a docs site (docs/) exists', earn: () => exists('docs/index.md') },
      { id: 'guide-coverage', points: 3, note: 'guide pages cover the feature specs',
        earn: () => clamp01(listFiles('docs/guide', (f) => f.endsWith('.md')).length / listFiles('specs', (f) => /\/F\d\d.*\.md$/.test(f)).length) },
      { id: 'maturity-tracked', points: 1, note: 'MATURITY.md exists', earn: () => exists('MATURITY.md') },
    ],
  },
  {
    label: 'Code quality',
    checks: [
      { id: 'strict-ts', points: 2, note: 'TypeScript strict mode',
        earn: () => /"strict"\s*:\s*true/.test(read('tsconfig.json')) },
      { id: 'zero-lint-errors', points: 2, note: 'eslint reports no errors',
        earn: () => { const l = lintCounts(); if (!l.ran) { warnings.push('eslint did not run'); return 0; } return l.errors === 0; } },
      { id: 'few-lint-warnings', points: 3, note: 'eslint warnings vs a 200 ceiling',
        earn: () => { const l = lintCounts(); return l.ran ? clamp01(1 - l.warnings / 200) : 0; } },
      { id: 'knip-clean', points: 2, note: 'no unused files/exports/deps (knip exits 0)',
        earn: () => commandSucceeds('npm run knip --silent') },
      { id: 'bundled', points: 1, note: 'a production bundler is configured',
        earn: () => exists('webpack.config.js') },
    ],
  },
  {
    label: 'AI-agent integration',
    checks: [
      { id: 'agents-md', points: 1, note: 'AGENTS.md (cross-vendor source of truth)', earn: () => exists('AGENTS.md') },
      { id: 'claude-imports-agents', points: 1, note: 'CLAUDE.md points at AGENTS.md, not a copy',
        earn: () => has('CLAUDE.md', /@AGENTS\.md/) },
      { id: 'spec-prompt-hook', points: 1, note: 'a prompt hook injects the spec workflow',
        earn: () => exists('.claude/hooks/spec-context.sh') },
      { id: 'precommit-agent-hook', points: 1, note: 'an agent pre-commit hook reaches the shared gate',
        earn: () => exists('.claude/hooks/pre-commit-gate.sh') },
      { id: 'coverage-agent-hook', points: 1, note: 'an agent hook checks coverage after edits',
        earn: () => exists('.claude/hooks/check-coverage.sh') },
      { id: 'session-bootstrap', points: 1, note: 'cold-session bootstrap (script + hook)',
        earn: () => exists('scripts/bootstrap.sh') && exists('.claude/hooks/session-bootstrap.sh') },
      { id: 'permissions-allowlist', points: 1, note: 'a permissions allowlist reduces prompts',
        earn: () => (readJson('.claude/settings.json')?.permissions?.allow ?? []).length > 0 },
      { id: 'portable-mcp', points: 1, note: 'project-scoped MCP config (.mcp.json)',
        earn: () => exists('.mcp.json') },
      { id: 'pr-template-ids', points: 1, note: 'the PR template asks for requirement IDs',
        earn: () => has('.github/pull_request_template.md', /requirement/i) },
      { id: 'machine-readable-state', points: 1, note: 'build state is machine-readable (traceability.json)',
        earn: () => readJson('specs/traceability.json') !== undefined },
    ],
  },
];

// ── compute ──────────────────────────────────────────────────────────────────

function scoreDimension(dim) {
  let earned = 0;
  let possible = 0;
  const checks = [];
  for (const c of dim.checks) {
    if (c.skip?.()) continue; // dropped from earned AND possible (e.g. uncached OSSF grade)
    const raw = c.earn();
    const frac = clamp01(typeof raw === 'boolean' ? (raw ? 1 : 0) : raw);
    earned += frac * c.points;
    possible += c.points;
    checks.push({ id: c.id, points: c.points, earned: Math.round(frac * c.points * 100) / 100, note: c.note });
  }
  return {
    label: dim.label,
    score: Math.round((MAX * earned / possible) * 10) / 10,
    earned: Math.round(earned * 100) / 100,
    possible,
    checks,
  };
}

function compute() {
  const dimensions = DIMENSIONS.map(scoreDimension);
  const overall = Math.round((dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length) * 10) / 10;
  const trace = traceabilityCounts();
  const cov = coverage();
  return {
    $comment: 'Generated by scripts/maturity-score.mjs — do not edit by hand. Run `npm run maturity` to refresh.',
    generatedAt: new Date().toISOString().slice(0, 10),
    scale: MAX,
    overall,
    dimensions,
    facts: {
      coverage: cov ?? null,
      requirements: { total: trace.total, byStatus: trace.by },
      pinnedActionRatio: Math.round(actionPinRatio() * 1000) / 1000,
    },
  };
}

// ── output ────────────────────────────────────────────────────────────────────

function printTable(result) {
  console.log(`Project maturity — ${result.generatedAt}  (overall ${result.overall.toFixed(1)} / ${MAX})`);
  console.log('─'.repeat(56));
  for (const d of result.dimensions) {
    console.log(`  ${d.label.padEnd(26)} ${d.score.toFixed(1)}  (${d.earned.toFixed(1)}/${d.possible})`);
  }
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} warning(s):`);
    for (const w of [...new Set(warnings)]) console.log(`  - ${w}`);
  }
}

// Keep MATURITY.md's hand-written "**Snapshot: YYYY-MM-DD**" line in lockstep
// with the computed score, so the two never drift (the date is otherwise the
// one fact in that doc a human had to remember to bump). Returns the previous
// date when it differs from `date`, or null when already in sync / no marker.
const SNAPSHOT_RE = /(\*\*Snapshot:\s*)(\d{4}-\d{2}-\d{2})(\*\*)/;
function readDocSnapshot() {
  try {
    return readFileSync(DOC_PATH, 'utf-8').match(SNAPSHOT_RE)?.[2] ?? null;
  } catch {
    return null;
  }
}
function syncDocSnapshot(date) {
  let text;
  try {
    text = readFileSync(DOC_PATH, 'utf-8');
  } catch {
    return null; // no MATURITY.md — nothing to keep in sync
  }
  const current = text.match(SNAPSHOT_RE)?.[2] ?? null;
  if (current === null || current === date) { return null; }
  writeFileSync(DOC_PATH, text.replace(SNAPSHOT_RE, `$1${date}$3`));
  return current;
}

const result = compute();
const serialized = JSON.stringify(result, null, 2) + '\n';

// Drift is judged on the ROUNDED scores only — never on raw facts. V8's branch-
// coverage counting differs across Node versions (e.g. 90.8% on Node 22 vs
// 90.95% on Node 24), so comparing raw `facts.coverage` would make `--check`
// fail spuriously in CI even when every 1-decimal score is identical. The
// scores are what the chart and the History actually track.
function comparable(r) {
  return JSON.stringify({
    scale: r.scale,
    overall: r.overall,
    dimensions: r.dimensions.map((d) => ({
      label: d.label,
      score: d.score,
      checks: d.checks.map((c) => ({ id: c.id, earned: c.earned })),
    })),
  });
}

if (process.argv.includes('--check')) {
  printTable(result);
  let committed;
  try {
    committed = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
  } catch {
    console.log('\n✗ maturity-score.json missing or unreadable. Run `npm run maturity` and commit it.');
    process.exit(1);
  }
  if (comparable(committed) !== comparable(result)) {
    console.log('\n✗ maturity-score.json scores are stale. Run `npm run maturity` and commit the result.');
    process.exit(1);
  }
  // Dates are excluded from the drift comparison above (they change every run),
  // but MATURITY.md's snapshot should still track the committed score's date —
  // flag it (non-fatally) so a stale doc gets noticed without failing the gate.
  const docDate = readDocSnapshot();
  if (docDate !== null && docDate !== committed.generatedAt) {
    console.log(
      `\n⚠ MATURITY.md snapshot (${docDate}) differs from the committed score date ` +
      `(${committed.generatedAt}). Run \`npm run maturity\` and commit MATURITY.md.`,
    );
  }
  console.log('\n✓ maturity-score.json scores are up to date.');
} else {
  writeFileSync(OUT_PATH, serialized);
  const prev = syncDocSnapshot(result.generatedAt);
  printTable(result);
  console.log(`\nWrote ${OUT_PATH.replace(ROOT + '/', '')}`);
  if (prev) {
    console.log(`Updated MATURITY.md snapshot: ${prev} → ${result.generatedAt}`);
  }
}
