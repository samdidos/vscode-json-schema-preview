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

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { HISTORY_DIR, toSnapshot, sameScores, snapshotFileName, readHistory } from './maturity-history-lib.mjs';
import { meanDocCoverage } from './doc-coverage-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'maturity-score.json');
const DOC_PATH = join(ROOT, 'MATURITY.md');
const MAX = 5;

// ── fact helpers (all read-only, offline) ──────────────────────────────────

const abs = (p) => join(ROOT, p);
const exists = (p) => existsSync(abs(p));
const read = (p) => { try { return readFileSync(abs(p), 'utf-8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return undefined; } };
/** Drop whole-line YAML comments so a check reads directives, not prose. A
 *  `#` inside a quoted string is not a comment, so only leading-`#` lines are
 *  stripped — enough for the directive checks here, and never wrong. */
const withoutYamlComments = (s) =>
  s.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');
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
    // Anchored to a `uses:` step key at the start of a line (after optional
    // `- `) — a bare substring match also caught `statuses: write` permission
    // lines and miscounted them as unpinned actions.
    for (const m of text.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s]+)/gm)) {
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
// points (a boolean is coerced). `note` documents the fact it reads; `why`
// justifies the check's point weight relative to its dimension's other checks
// (S12-SR-01 — rendered on the docs site's criteria pages). An optional
// `skip()` returning true drops the check from BOTH earned and possible (used
// for the OpenSSF grade, which only counts when its offline cache is present);
// skipped checks are still emitted, flagged `skipped`, so the rubric stays
// documented even when a snapshot omits them (S12-SR-08).
// Each dimension additionally carries a URL-safe `slug` (the docs-site page
// path) and a `description` of what it measures (S12-SR-01).

const warnings = [];

const DIMENSIONS = [
  {
    label: 'Spec & process',
    slug: 'spec-process',
    description:
      'Whether the spec-driven workflow is real rather than aspirational: RFC-2119 requirements exist, ' +
      'every one is tracked in the traceability matrix, and the verify gate mechanically enforces the link ' +
      'between specs, matrix, and tests on every commit.',
    checks: [
      { id: 'traceability-passes', points: 4, note: 'npm run check:traceability exits 0',
        why: 'The core guarantee: the whole spec system is only trustworthy while the checker passes, so drift between specs, matrix, and test tags outweighs every other signal here.',
        earn: () => commandSucceeds('node scripts/check-traceability.mjs') },
      { id: 'zero-untracked', points: 2, note: 'no requirement left untracked',
        why: 'Untracked entries are acknowledged debt that hides real status; serious, but a narrower signal than the checker passing outright.',
        earn: () => traceabilityCounts().untracked === 0 },
      { id: 'verify-runs-traceability', points: 2, note: 'the local/CI gate runs check:traceability',
        why: 'Enforcement placement: a checker that passes today is worth little unless the shared gate forces it on every commit for any agent or human.',
        // Follows `scripts.verify` to whatever it runs (S12-SR-15): the gate
        // moved out of package.json into scripts/verify.mjs, and matching only
        // the npm script silently zeroed this the day that happened.
        earn: () => {
          const script = readJson('package.json')?.scripts?.verify ?? '';
          if (/check:traceability/.test(script)) return true;
          const runner = /node\s+(\S+\.mjs)/.exec(script)?.[1];
          return !!runner && exists(runner) && /check:traceability/.test(read(runner));
        } },
      { id: 'constitution-present', points: 1, note: '.specify/memory/constitution.md exists',
        why: 'Presence of the governing document matters, but presence alone proves little about practice — minimal weight.',
        earn: () => exists('.specify/memory/constitution.md') },
      { id: 'specs-present', points: 1, note: '≥ 10 requirement spec files',
        why: 'A crude floor on corpus size so the other checks cannot be satisfied by a near-empty specs/ directory; deliberately the weakest signal.',
        earn: () => listFiles('specs', (f) => /\/[FS]\d\d.*\.md$/.test(f)).length >= 10 },
    ],
  },
  {
    label: 'Testing',
    slug: 'testing',
    description:
      'How much of the code the test suite genuinely exercises: the three c8 coverage axes against a 95% ' +
      'target, whether a mutation-testing gate exists to check that the tests assert (not just execute), and ' +
      'how few source files escape measurement via coverage exclusions.',
    checks: [
      { id: 'branch-coverage', points: 3, note: 'branch coverage vs a 95% target',
        why: 'Branches are the hardest and most meaningful coverage axis — error paths and edge cases live there, and it is the axis that actually lags — so it carries the most weight.',
        earn: () => { const c = coverage(); if (!c) { warnings.push('coverage-summary.json missing — run npm test'); return 0; } return clamp01(c.branches / 95); } },
      { id: 'line-coverage', points: 2, note: 'line coverage vs a 95% target',
        why: 'A broad bulk signal, but easier to satisfy than branch coverage (straight-line code inflates it), so it earns less.',
        earn: () => { const c = coverage(); return c ? clamp01(c.lines / 95) : 0; } },
      { id: 'function-coverage', points: 1, note: 'function coverage vs a 95% target',
        why: 'Near-saturated in practice and the weakest discriminator of the three axes — a function counts as covered after a single call.',
        earn: () => { const c = coverage(); return c ? clamp01(c.functions / 95) : 0; } },
      { id: 'mutation-gate', points: 2, note: 'stryker break threshold is set (not null)',
        why: 'Coverage proves code ran; mutation testing proves tests assert. Only the gate’s existence is checked (a full run is expensive), so it gets mid weight rather than more.',
        earn: () => readJson('stryker.config.json')?.thresholds?.break != null },
      { id: 'low-exclusion', points: 2, note: 'few source files excluded from coverage',
        why: 'Excluded files are blind spots that silently inflate every other number in this dimension, so exclusion creep has to cost points.',
        earn: () => 1 - srcExclusionRatio().ratio },
    ],
  },
  {
    label: 'Security / supply chain',
    slug: 'security-supply-chain',
    description:
      'Defences against vulnerable code and a compromised build pipeline: continuous static analysis and ' +
      'posture scanning (CodeQL, OpenSSF Scorecard), dependency update automation, SLSA provenance for the ' +
      'released artifact, SHA-pinned GitHub Actions, and — when its cache is present — the live, externally ' +
      'measured OpenSSF Scorecard grade.',
    checks: [
      { id: 'codeql', points: 2, note: 'CodeQL workflow present',
        why: 'Continuous static vulnerability analysis on every change — one of the two always-on scanners this dimension leans on.',
        earn: () => exists('.github/workflows/codeql.yml') },
      { id: 'scorecard', points: 2, note: 'OpenSSF Scorecard workflow present',
        why: 'Continuously re-measures the repo’s supply-chain posture against an open industry standard, catching regressions the presence checks here would miss.',
        earn: () => exists('.github/workflows/scorecard.yml') },
      { id: 'dependabot', points: 1, note: 'Dependabot configured',
        why: 'Automated dependency updates are important hygiene but nearly free to set up, so mere presence earns the least.',
        earn: () => exists('.github/dependabot.yml') },
      { id: 'slsa-provenance', points: 2, note: 'SLSA build provenance attested for the release artifact',
        why: 'Provenance lets downstream users verify the published .vsix came from this repo’s CI — protection that extends beyond the repo itself.',
        earn: () => workflowFiles().some((f) => /provenance|slsa|attest/i.test(read(f))) },
      { id: 'pinned-actions', points: 3, note: 'GitHub Actions pinned to a full commit SHA',
        why: 'An unpinned action is arbitrary third-party code execution inside CI — the most direct supply-chain risk here — and the ratio moves with every workflow edit, so it outweighs the presence checks.',
        earn: () => actionPinRatio() },
      { id: 'ossf-scorecard-grade', points: 4,
        note: 'live OpenSSF Scorecard grade /10 (offline cache; refresh with npm run maturity:ossf)',
        why: 'The one externally *measured* grade in the dimension — independent and continuous rather than self-reported presence — so it carries the most weight; skipped entirely when no offline cache exists, to keep the scorer deterministic.',
        skip: () => { const c = readJson('ossf-scorecard.json'); return c == null || typeof c.score !== 'number'; },
        earn: () => clamp01((readJson('ossf-scorecard.json')?.score ?? 0) / 10) },
    ],
  },
  {
    label: 'CI/CD & release',
    slug: 'cicd-release',
    description:
      'Whether the path from commit to release is automated and honest: CI exists and no job swallows ' +
      'failures, releases and changelogs are derived mechanically from Conventional Commits, and the same ' +
      'verify gate runs locally before a commit ever reaches CI.',
    checks: [
      { id: 'ci-present', points: 1, note: 'a CI workflow exists',
        why: 'Table stakes — everything else in this dimension presumes it, so bare presence earns the minimum.',
        earn: () => exists('.github/workflows/ci.yml') },
      { id: 'no-continue-on-error', points: 2, note: 'no CI job silently swallows failures',
        why: 'A swallowed failure rots the signal of every other check CI runs — green must actually mean green.',
        // Comments are not configuration (S12-SR-15): a workflow explaining
        // why it does NOT use continue-on-error must not trip this check.
        earn: () => !workflowFiles().some((f) => /continue-on-error:\s*true/.test(withoutYamlComments(read(f)))) },
      { id: 'release-automation', points: 2, note: 'release-please configured',
        why: 'Removes human error from versioning and changelogs, making releases reproducible decisions instead of rituals.',
        earn: () => exists('.github/workflows/release-please.yml') },
      { id: 'conventional-commits', points: 2, note: 'commitlint + commit-msg hook enforce Conventional Commits',
        why: 'The machine-readable history that release automation depends on; enforced at commit time, it keeps the changelog derivable rather than curated.',
        earn: () => exists('commitlint.config.js') && exists('.husky/commit-msg') },
      { id: 'precommit-gate', points: 2, note: 'a pre-commit hook runs the verify gate',
        why: 'Catches failures before they ever reach CI, and — because it is a git hook — applies to any agent or human, per the project’s agnosticity principle.',
        earn: () => has('.husky/pre-commit', /verify/) },
      { id: 'knip-in-ci', points: 1, note: 'dead-code analysis runs in CI',
        why: 'Valuable hygiene, but a narrower concern than gates and release automation — hence the smallest weight.',
        earn: () => has('.github/workflows/ci.yml', /knip/) },
    ],
  },
  {
    label: 'Docs',
    slug: 'docs',
    description:
      'Whether the project explains itself: the standard community files exist (README, CONTRIBUTING, code ' +
      'of conduct, security policy, license), a docs site is published, maturity is tracked over time, and — ' +
      'the depth signal — guide pages actually keep up with the feature specs.',
    checks: [
      { id: 'readme', points: 1, note: 'README.md',
        why: 'The community-standard files are each binary and roughly equally important, so every presence check here carries the same single point.',
        earn: () => exists('README.md') },
      { id: 'contributing', points: 1, note: 'CONTRIBUTING.md',
        why: 'Equal-weight presence check: how to contribute is one of the standard files a healthy repo simply has.',
        earn: () => exists('CONTRIBUTING.md') },
      { id: 'code-of-conduct', points: 1, note: 'CODE_OF_CONDUCT.md',
        why: 'Equal-weight presence check alongside the other community-standard files.',
        earn: () => exists('CODE_OF_CONDUCT.md') },
      { id: 'security-policy', points: 1, note: 'SECURITY.md',
        why: 'Equal-weight presence check: a documented way to report vulnerabilities.',
        earn: () => exists('SECURITY.md') },
      { id: 'license', points: 1, note: 'LICENSE.md',
        why: 'Equal-weight presence check: without a license the rest of the docs hardly matter.',
        earn: () => exists('LICENSE.md') },
      { id: 'docs-site', points: 1, note: 'a docs site (docs/) exists',
        why: 'Equal-weight presence check for a published site; its *depth* is scored separately by guide-coverage.',
        earn: () => exists('docs/index.md') },
      { id: 'doc-coverage', points: 3, note: 'mean per-spec documentation depth: tagged doc words vs words expected from each spec’s evaluated complexity (S07-SR-10..12)',
        why: 'The only depth signal in the dimension: it measures how much of each spec is actually documented (words attributed via spec: tags, against a complexity-derived expectation), not whether files exist — replacing the old page-count ratio, which a stub page could satisfy. It moves with every requirement and every paragraph written, so it outweighs any single presence check.',
        earn: () => meanDocCoverage(ROOT) },
      { id: 'maturity-tracked', points: 1, note: 'MATURITY.md exists',
        why: 'Equal-weight presence check: maturity itself is tracked in a committed, dated document.',
        earn: () => exists('MATURITY.md') },
    ],
  },
  {
    label: 'Code quality',
    slug: 'code-quality',
    description:
      'The static health of the source: TypeScript strict mode, an error-free lint run, how far the tolerated ' +
      'lint-warning count sits below its ceiling, a clean dead-code analysis, and a production bundler for ' +
      'the shipped artifact.',
    checks: [
      { id: 'strict-ts', points: 2, note: 'TypeScript strict mode',
        why: 'The compiler’s strongest correctness net — it eliminates whole bug classes at build time rather than flagging them for later.',
        earn: () => /"strict"\s*:\s*true/.test(read('tsconfig.json')) },
      { id: 'zero-lint-errors', points: 2, note: 'eslint reports no errors',
        why: 'Lint errors are defects the project has already agreed to prohibit; any nonzero count means the agreement is not being kept.',
        earn: () => { const l = lintCounts(); if (!l.ran) { warnings.push('eslint did not run'); return 0; } return l.errors === 0; } },
      { id: 'few-lint-warnings', points: 3, note: 'eslint warnings vs a 200 ceiling',
        why: 'The live debt gauge of the dimension: unlike the binary checks it has range, moves with every edit, and rewards paying debt down — so it carries the most weight.',
        earn: () => { const l = lintCounts(); return l.ran ? clamp01(1 - l.warnings / 200) : 0; } },
      { id: 'knip-clean', points: 2, note: 'no unused files/exports/deps (knip exits 0)',
        why: 'Dead code is untested, misleading surface area that still costs review and maintenance; keeping it at zero is a real, enforced discipline.',
        earn: () => commandSucceeds('npm run knip --silent') },
      { id: 'bundled', points: 1, note: 'a production bundler is configured',
        why: 'Matters for what ships, but it is mostly a one-time setup rather than an ongoing practice — hence the smallest weight.',
        earn: () => exists('webpack.config.js') },
    ],
  },
  {
    label: 'AI-agent integration',
    slug: 'ai-agent-integration',
    description:
      'How well the repository supports AI coding agents — of any vendor — as first-class contributors. ' +
      'No external standard exists for this, so it is a deliberate equal-weight presence checklist ' +
      '(documented in MATURITY.md): each item is one point because ranking them would be judgement, ' +
      'not measurement.',
    checks: [
      { id: 'agents-md', points: 1, note: 'AGENTS.md (cross-vendor source of truth)',
        why: 'The cross-vendor instruction file every agent can read — the foundation of the checklist; one point like every item in this deliberately unranked dimension.',
        earn: () => exists('AGENTS.md') },
      { id: 'claude-imports-agents', points: 1, note: 'CLAUDE.md points at AGENTS.md, not a copy',
        why: 'Verifies the per-tool file is a pointer, not a fork — duplicated instructions drift. Equal weight by the checklist principle.',
        earn: () => has('CLAUDE.md', /@AGENTS\.md/) },
      { id: 'spec-prompt-hook', points: 1, note: 'a prompt hook injects the spec workflow',
        why: 'Puts the spec-driven workflow in front of the agent on every prompt, instead of relying on it re-reading docs. Equal weight by the checklist principle.',
        earn: () => exists('.claude/hooks/spec-context.mjs') },
      { id: 'precommit-agent-hook', points: 1, note: 'an agent pre-commit hook reaches the shared gate',
        why: 'Fast in-session feedback that delegates to the vendor-neutral git hook, so the check logic lives in one place. Equal weight by the checklist principle.',
        earn: () => exists('.claude/hooks/pre-commit-gate.mjs') },
      { id: 'coverage-agent-hook', points: 1, note: 'an agent hook checks coverage after edits',
        why: 'Surfaces coverage regressions right after an edit instead of at commit time. Equal weight by the checklist principle.',
        earn: () => exists('.claude/hooks/check-coverage.mjs') },
      { id: 'session-bootstrap', points: 1, note: 'cold-session bootstrap (script + hook)',
        why: 'A cold container that cannot install dependencies wastes every subsequent agent action; bootstrap makes sessions productive from the first prompt. Equal weight by the checklist principle.',
        earn: () => exists('scripts/bootstrap.mjs') && exists('.claude/hooks/session-bootstrap.mjs') },
      { id: 'permissions-allowlist', points: 1, note: 'a permissions allowlist reduces prompts',
        why: 'Pre-approving known-safe commands keeps agents autonomous without widening what they may do. Equal weight by the checklist principle.',
        earn: () => (readJson('.claude/settings.json')?.permissions?.allow ?? []).length > 0 },
      { id: 'portable-mcp', points: 1, note: 'project-scoped MCP config (.mcp.json)',
        why: 'Tool access declared once via the open protocol works for any MCP-capable agent, instead of per-vendor integrations. Equal weight by the checklist principle.',
        earn: () => exists('.mcp.json') },
      { id: 'pr-template-ids', points: 1, note: 'the PR template asks for requirement IDs',
        why: 'Makes requirement traceability part of the review surface for human and agent PRs alike. Equal weight by the checklist principle.',
        earn: () => has('.github/pull_request_template.md', /requirement/i) },
      { id: 'machine-readable-state', points: 1, note: 'build state is machine-readable (traceability.json)',
        why: 'Agents plan far better against structured state than prose; the matrix is the machine-readable ground truth. Equal weight by the checklist principle.',
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
    if (c.skip?.()) {
      // Dropped from earned AND possible (e.g. uncached OSSF grade), but still
      // emitted — flagged — so the rubric stays fully documented (S12-SR-08).
      checks.push({ id: c.id, points: c.points, skipped: true, note: c.note, why: c.why });
      continue;
    }
    const raw = c.earn();
    const frac = clamp01(typeof raw === 'boolean' ? (raw ? 1 : 0) : raw);
    earned += frac * c.points;
    possible += c.points;
    checks.push({ id: c.id, points: c.points, earned: Math.round(frac * c.points * 100) / 100, note: c.note, why: c.why });
  }
  return {
    label: dim.label,
    slug: dim.slug,
    description: dim.description,
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

// Score history (S12-SR-09): on a scoring run, when the rounded score state
// differs from the most recent snapshot in maturity-history/ (or none exists),
// record a new timestamp-named snapshot. Unchanged scores add nothing, so the
// folder is a change log, not a run log. Returns the written filename or null.
function writeHistorySnapshot(scoreResult) {
  const nowIso = new Date().toISOString().slice(0, 19) + 'Z';
  const snapshot = toSnapshot(scoreResult, nowIso);
  const history = readHistory(ROOT);
  const latest = history[history.length - 1];
  if (latest && sameScores(latest, snapshot)) return null;
  mkdirSync(join(ROOT, HISTORY_DIR), { recursive: true });
  const file = join(HISTORY_DIR, snapshotFileName(nowIso));
  writeFileSync(join(ROOT, file), JSON.stringify({
    $comment: 'Generated by scripts/maturity-score.mjs — one file per score change. Do not edit by hand.',
    ...snapshot,
  }, null, 2) + '\n');
  return file;
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

/** Paths this file probes via exists()/read()/readJson() with a literal
 *  argument. A predicate naming a path that no longer exists scores a silent
 *  zero (S12-SR-15), which is breakage rather than drift — so `--check` fails
 *  on it even though it never fails on a moved score (S12-SR-16). */
function unresolvablePredicatePaths() {
  const self = read('scripts/maturity-score.mjs');
  const paths = new Set();
  for (const m of self.matchAll(/\b(?:exists|readJson|read)\(\s*'([^']+)'\s*\)/g)) paths.add(m[1]);
  return [...paths].filter((p) => !exists(p));
}

if (process.argv.includes('--check')) {
  printTable(result);
  const broken = unresolvablePredicatePaths();
  if (broken.length) {
    console.log('\n✗ These checks probe paths that no longer exist, so they score a silent 0:');
    for (const p of broken) console.log(`  - ${p}`);
    console.log('Fix the predicate to match the artifact it measures (S12-SR-15).');
    process.exit(1);
  }
  let committed;
  try {
    committed = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
  } catch {
    console.log('\n✗ maturity-score.json missing or unreadable. Run `npm run maturity` and commit it.');
    process.exit(1);
  }
  // S12-SR-16: a moved score is a prompt, not a gate. The score changes with
  // coverage and with every requirement added, so failing here would redden
  // pull requests that changed nothing about maturity — and would put the
  // build's health behind keeping the number flattering.
  const stale = comparable(committed) !== comparable(result);
  if (stale) {
    console.log(
      `\n⚠ maturity-score.json is out of date (committed ${committed.overall}, ` +
      `recomputed ${result.overall}). Run \`npm run maturity\` and commit the result.`,
    );
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
  // Exit 0 either way (S12-SR-16) — but never claim "up to date" when it isn't.
  console.log(
    stale
      ? '\n✓ Scorer is healthy; the committed snapshot just needs refreshing (not a failure).'
      : '\n✓ maturity-score.json scores are up to date.',
  );
} else {
  writeFileSync(OUT_PATH, serialized);
  const prev = syncDocSnapshot(result.generatedAt);
  const historyFile = writeHistorySnapshot(result);
  printTable(result);
  console.log(`\nWrote ${OUT_PATH.replace(ROOT + '/', '')}`);
  if (prev) {
    console.log(`Updated MATURITY.md snapshot: ${prev} → ${result.generatedAt}`);
  }
  if (historyFile) {
    console.log(`Scores changed — recorded ${historyFile}`);
  }
}
