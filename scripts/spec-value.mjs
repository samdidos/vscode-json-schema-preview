#!/usr/bin/env node
// Advisory customer-value estimates — validator + report (S16).
//
// specs/value.json holds one estimate per FEATURE spec: reach, impact and
// confidence are the authored values; score and tier are DERIVED from the
// calibration chart below (S16-SR-01). The estimate is a judgement with
// provenance, deliberately fenced away from the maturity score (S16-NFR-01):
// scripts/maturity-score.mjs never reads this file.
//
// The model is RICE (Intercom, 2016) adapted to a repository with zero
// telemetry by design (S05): Reach is a banded scale rather than a headcount,
// and the Effort divisor reuses the S13 story points already in
// specs/effort.json rather than inventing a second effort number.
//
// Usage:
//   node scripts/spec-value.mjs             validate specs/value.json (exit 1 on error)
//   node scripts/spec-value.mjs --report    print the ranked value / RICE tables
//
// The calibration constants here are the machine-readable authority
// (S16-SR-04); the human-readable chart lives in specs/S16-*.md.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VALUE_PATH = join(ROOT, 'specs', 'value.json');

// ── calibration chart (rubric v1, S16-SR-04) ────────────────────────────────

export const RUBRIC_VERSION = 1;

/** Share of users who hit the feature in a typical month. */
export const REACH = {
  1: 'under 5% — a narrow subset of users',
  2: '5–20% — a recognisable minority',
  3: '20–50% — a substantial share',
  4: '50–80% — most users',
  5: 'over 80% — effectively everyone',
};
/** How much the outcome changes for a user the feature does reach. */
export const IMPACT = {
  1: 'minor convenience; trivially done by hand',
  2: 'saves minutes of manual work',
  3: 'saves real time or avoids a common mistake',
  4: 'removes a manual workflow or prevents a class of bugs',
  5: 'a reason someone installs the extension',
};
/** Evidence quality behind the reach and impact figures. */
export const CONFIDENCE = {
  1.0: 'grounded in the extension’s stated purpose and documented behaviour',
  0.8: 'reasoned from the JSON Schema domain and comparable tooling',
  0.5: 'speculative — no comparable to reason from',
};
/** Enumerated adjustment factors (S16-SR-02); each is one ±10% step. */
export const FACTORS = {
  ZEROCONF: { dir: +1, meaning: 'delivers value with no configuration or user action' },
  UNIQUE: { dir: +1, meaning: 'no built-in VS Code or common-extension equivalent' },
  GATEWAY: { dir: +1, meaning: 'unlocks or is a precondition for other features’ value' },
  CI: { dir: +1, meaning: 'also delivers value outside the editor (CI/automation)' },
  DEP: { dir: -1, meaning: 'needs an external dependency or setup for full value' },
  OVERLAP: { dir: -1, meaning: 'substantially available from built-ins or common tools' },
  NARROW: { dir: -1, meaning: 'applies only within a narrow workflow' },
};
/** Net factor steps are clamped to this many in either direction. */
export const MAX_FACTOR_STEPS = 2;
export const STEP_WEIGHT = 0.1;
/** [minScore, tier] — first band whose minScore <= score wins. */
export const TIERS = [
  [20, 'Critical'],
  [12, 'High'],
  [6, 'Moderate'],
  [2.5, 'Niche'],
  [0, 'Marginal'],
];

export const round2 = (n) => Math.round(n * 100) / 100;

/** Net ±steps from the factor codes, clamped to ±MAX_FACTOR_STEPS. */
export function netSteps(factors = []) {
  const sum = factors.reduce((s, c) => s + (FACTORS[c]?.dir ?? 0), 0);
  return Math.max(-MAX_FACTOR_STEPS, Math.min(MAX_FACTOR_STEPS, sum));
}

/** Derived score: reach × impact × confidence, then the bounded adjustment. */
export function scoreFor({ reach, impact, confidence, factors }) {
  return round2(reach * impact * confidence * (1 + STEP_WEIGHT * netSteps(factors)));
}

export function tierFor(score) {
  return TIERS.find(([min]) => score >= min)[1];
}

// ── inputs ──────────────────────────────────────────────────────────────────

/** Feature spec ids (F##) — value is scored for customer-facing features
 *  only; system specs are quality attributes, not features (S16-SR-06). */
export function featureSpecIds(rootDir = ROOT) {
  return readdirSync(join(rootDir, 'specs'))
    .filter((n) => /^F\d{2}-.*\.md$/.test(n))
    .map((n) => n.slice(0, 3))
    .sort();
}

/** Effort points per spec, for the RICE divisor. Never stored in value.json —
 *  effort.json stays the single source of truth for effort (S16-SR-05). */
export function effortPoints(rootDir = ROOT) {
  const path = join(rootDir, 'specs', 'effort.json');
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  return Object.fromEntries(
    Object.entries(raw.specs ?? {}).map(([id, e]) => [id, e.points]),
  );
}

// ── validation (S16-SR-03) ──────────────────────────────────────────────────

export function validate(rootDir = ROOT) {
  const errors = [];
  const warnings = [];
  let value;
  try {
    value = JSON.parse(readFileSync(join(rootDir, 'specs', 'value.json'), 'utf-8'));
  } catch {
    return { errors: ['specs/value.json missing or unreadable'], warnings };
  }
  if (value.rubricVersion !== RUBRIC_VERSION) {
    warnings.push(`value.json rubricVersion ${value.rubricVersion} != script rubric ${RUBRIC_VERSION}`);
  }
  const features = featureSpecIds(rootDir);
  const points = effortPoints(rootDir);
  const scored = value.features ?? {};

  for (const id of features) {
    if (!(id in scored)) errors.push(`${id}: no value estimate in specs/value.json (S16-SR-01)`);
  }
  for (const [id, v] of Object.entries(scored)) {
    if (!features.includes(id)) {
      errors.push(`${id}: scored but is not a feature spec (S16-SR-06)`);
      continue;
    }
    if (!(v.reach in REACH)) errors.push(`${id}: reach ${v.reach} is not on the 1–5 scale`);
    if (!(v.impact in IMPACT)) errors.push(`${id}: impact ${v.impact} is not on the 1–5 scale`);
    if (!(v.confidence in CONFIDENCE)) {
      errors.push(`${id}: confidence ${v.confidence} is not one of ${Object.keys(CONFIDENCE).join(', ')}`);
    }
    for (const code of v.factors ?? []) {
      if (!(code in FACTORS)) errors.push(`${id}: unknown factor code "${code}"`);
    }
    // Derived fields must agree with the chart — they are never authorable.
    if (v.reach in REACH && v.impact in IMPACT && v.confidence in CONFIDENCE) {
      const expected = scoreFor(v);
      if (round2(v.score) !== expected) {
        errors.push(`${id}: score ${v.score} contradicts reach×impact×confidence and factors (chart says ${expected})`);
      }
      const expectedTier = tierFor(expected);
      if (v.tier !== expectedTier) {
        errors.push(`${id}: tier "${v.tier}" contradicts score ${expected} (chart says ${expectedTier})`);
      }
    }
    const raw = (v.factors ?? []).reduce((s, c) => s + (FACTORS[c]?.dir ?? 0), 0);
    if (Math.abs(raw) > MAX_FACTOR_STEPS) {
      warnings.push(`${id}: ${Math.abs(raw)} net factor steps clamped to ${MAX_FACTOR_STEPS} — some codes have no effect`);
    }
    if (!v.justification) errors.push(`${id}: missing justification (S16-SR-02)`);
    if (!v.estimatedAt || !v.estimator) errors.push(`${id}: missing provenance (estimator/estimatedAt, S16-SR-02)`);
    if (v.confidence === 0.5) {
      warnings.push(`${id}: confidence 0.5 (speculative) — treat its rank as provisional`);
    }
    if (!(id in points)) {
      warnings.push(`${id}: no effort estimate in specs/effort.json — RICE cannot be computed`);
    }
  }
  return { errors, warnings };
}

// ── report ──────────────────────────────────────────────────────────────────

export function report(rootDir = ROOT) {
  const value = JSON.parse(readFileSync(join(rootDir, 'specs', 'value.json'), 'utf-8'));
  const points = effortPoints(rootDir);
  return Object.entries(value.features ?? {})
    .map(([id, v]) => ({
      id,
      ...v,
      points: points[id] ?? null,
      rice: points[id] ? round2(v.score / points[id]) : null,
    }))
    .sort((a, b) => b.score - a.score || (b.rice ?? 0) - (a.rice ?? 0));
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  if (process.argv.includes('--report')) {
    const rows = report();
    console.log('Customer value (advisory) — ranked by score');
    console.log('─'.repeat(78));
    console.log(`${pad('id', 5)}${lpad('R', 2)}${lpad('I', 3)}${lpad('C', 5)}${lpad('score', 7)}  ${pad('tier', 10)}${lpad('pts', 4)}${lpad('RICE', 7)}`);
    for (const r of rows) {
      console.log(
        `${pad(r.id, 5)}${lpad(r.reach, 2)}${lpad(r.impact, 3)}${lpad(r.confidence.toFixed(1), 5)}` +
        `${lpad(r.score.toFixed(1), 7)}  ${pad(r.tier, 10)}${lpad(r.points ?? '–', 4)}${lpad(r.rice?.toFixed(2) ?? '–', 7)}`,
      );
    }
    console.log('\nBy RICE (value per effort point)');
    console.log('─'.repeat(78));
    for (const [i, r] of [...rows].filter((r) => r.rice).sort((a, b) => b.rice - a.rice).slice(0, 10).entries()) {
      console.log(`${lpad(i + 1, 2)}. ${pad(r.id, 5)}RICE ${r.rice.toFixed(2)}  (score ${r.score.toFixed(1)} / ${r.points} pts)`);
    }
  } else {
    const { errors, warnings } = validate();
    console.log('Customer value estimates (advisory)');
    console.log('─'.repeat(48));
    for (const w of warnings) console.log(`⚠ ${w}`);
    if (errors.length) {
      for (const e of errors) console.log(`✗ ${e}`);
      console.log(`\n${errors.length} error(s) — see specs/S16-feature-value-estimation.md for the rubric.`);
      process.exit(1);
    }
    const n = Object.keys(JSON.parse(readFileSync(VALUE_PATH, 'utf-8')).features).length;
    console.log(`✓ ${n} value estimates valid against rubric v${RUBRIC_VERSION}.`);
  }
}
