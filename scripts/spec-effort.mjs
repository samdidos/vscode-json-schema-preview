#!/usr/bin/env node
// Advisory spec-effort estimates — validator + evidence extractor (S13).
//
// specs/effort.json holds one estimate per spec: Fibonacci story points as
// the single authored value, with T-shirt size and an hour band DERIVED from
// the calibration chart below (S13-SR-01). The estimate is a judgement with
// provenance, deliberately fenced away from the maturity score (S13-NFR-01):
// scripts/maturity-score.mjs never reads this file.
//
// Usage:
//   node scripts/spec-effort.mjs              validate specs/effort.json (exit 1 on error)
//   node scripts/spec-effort.mjs --evidence   print current evidence + suggested base points
//
// The calibration constants here are the machine-readable authority
// (S13-SR-04); the human-readable chart lives in specs/S13-*.md.
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EFFORT_PATH = join(ROOT, 'specs', 'effort.json');

// ── calibration chart (rubric v1, S13-SR-04) ────────────────────────────────

export const RUBRIC_VERSION = 1;
export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
/** [maxLoc, basePoints] — first band whose maxLoc >= impl LOC wins. */
export const LOC_BANDS = [
  [150, 1],
  [400, 2],
  [800, 3],
  [1500, 5],
  [2500, 8],
  [4000, 13],
  [Infinity, 21],
];
export const TSHIRT = { 1: 'XS', 2: 'S', 3: 'S', 5: 'M', 8: 'L', 13: 'XL', 21: 'XXL' };
/** points -> [hoursMin, hoursMax|null] — solo-human calibration anchor. */
export const HOURS = { 1: [0, 2], 2: [2, 4], 3: [4, 8], 5: [8, 16], 8: [16, 32], 13: [32, 80], 21: [80, null] };
/** Enumerated adjustment factors (S13-SR-02); direction is ±1 Fibonacci step. */
export const FACTORS = { NOVEL: 1, EXT: 1, UI: 1, INFRA: 1, GEN: -1, PATTERN: -1 };

export function basePointsForLoc(loc) {
  return LOC_BANDS.find(([max]) => loc <= max)[1];
}

// ── evidence (read from the finished work) ──────────────────────────────────

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

/** Per-spec evidence: impl file count + LOC (from traceability impl paths),
 *  [ID]-tagged test count, requirement count. */
export function computeEvidence(rootDir = ROOT) {
  const matrix = JSON.parse(readFileSync(join(rootDir, 'specs', 'traceability.json'), 'utf-8'));
  const specIds = readdirSync(join(rootDir, 'specs'))
    .filter((n) => /^[FS]\d{2}-.*\.md$/.test(n))
    .map((n) => n.slice(0, 3));
  const bySpec = new Map(specIds.map((id) => [id, { implFiles: new Set(), requirements: 0 }]));
  for (const [rid, entry] of Object.entries(matrix.requirements ?? {})) {
    const spec = rid.slice(0, 3);
    const rec = bySpec.get(spec);
    if (!rec) continue;
    rec.requirements++;
    for (const f of entry.impl ?? []) rec.implFiles.add(f);
  }
  const testText = walk(join(rootDir, 'src', 'test'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(f, 'utf-8'))
    .join('\n');
  const out = {};
  for (const [spec, rec] of bySpec) {
    // Impl entries can name a directory (rare); only regular files carry LOC.
    const files = [...rec.implFiles].filter(
      (f) => existsSync(join(rootDir, f)) && statSync(join(rootDir, f)).isFile(),
    );
    const implLoc = files.reduce(
      (sum, f) => sum + readFileSync(join(rootDir, f), 'utf-8').split('\n').length,
      0,
    );
    const tagRe = new RegExp(`\\[${spec}-(?:FR|NFR|SR)-\\d+\\]`, 'g');
    out[spec] = {
      implFiles: files.length,
      implLoc,
      taggedTests: (testText.match(tagRe) ?? []).length,
      requirements: rec.requirements,
    };
  }
  return out;
}

// ── validation (S13-SR-03) ──────────────────────────────────────────────────

export function validate(rootDir = ROOT) {
  const errors = [];
  const warnings = [];
  let effort;
  try {
    effort = JSON.parse(readFileSync(join(rootDir, 'specs', 'effort.json'), 'utf-8'));
  } catch {
    return { errors: ['specs/effort.json missing or unreadable'], warnings };
  }
  if (effort.rubricVersion !== RUBRIC_VERSION) {
    warnings.push(`effort.json rubricVersion ${effort.rubricVersion} != script rubric ${RUBRIC_VERSION}`);
  }
  const live = computeEvidence(rootDir);
  const estimated = new Set(Object.keys(effort.specs ?? {}));

  for (const spec of Object.keys(live)) {
    if (!estimated.has(spec)) errors.push(`${spec}: no estimate in specs/effort.json (S13-SR-01)`);
  }
  for (const [spec, e] of Object.entries(effort.specs ?? {})) {
    if (!(spec in live)) {
      errors.push(`${spec}: estimated but no such spec file exists`);
      continue;
    }
    if (!FIBONACCI.includes(e.points)) errors.push(`${spec}: points ${e.points} is not Fibonacci`);
    if (!FIBONACCI.includes(e.basePoints)) errors.push(`${spec}: basePoints ${e.basePoints} is not Fibonacci`);
    if (e.tshirt !== TSHIRT[e.points]) {
      errors.push(`${spec}: tshirt "${e.tshirt}" contradicts points ${e.points} (chart says ${TSHIRT[e.points]})`);
    }
    const [hMin, hMax] = HOURS[e.points] ?? [];
    if (e.hoursMin !== hMin || (e.hoursMax ?? null) !== hMax) {
      errors.push(`${spec}: hour band [${e.hoursMin}, ${e.hoursMax}] contradicts points ${e.points} (chart says [${hMin}, ${hMax}])`);
    }
    const recordedLoc = e.evidence?.implLoc;
    if (typeof recordedLoc !== 'number') {
      errors.push(`${spec}: missing evidence.implLoc snapshot (S13-SR-02)`);
    } else if (e.basePoints !== basePointsForLoc(recordedLoc)) {
      errors.push(`${spec}: basePoints ${e.basePoints} contradicts recorded evidence LOC ${recordedLoc} (band says ${basePointsForLoc(recordedLoc)})`);
    }
    const stepDiff = Math.abs(FIBONACCI.indexOf(e.points) - FIBONACCI.indexOf(e.basePoints));
    if (stepDiff > 1) errors.push(`${spec}: points ${e.points} is ${stepDiff} steps from base ${e.basePoints} — max one (S13-SR-03)`);
    for (const code of e.factors ?? []) {
      if (!(code in FACTORS)) errors.push(`${spec}: unknown factor code "${code}"`);
    }
    if (stepDiff > 0) {
      const dir = Math.sign(FIBONACCI.indexOf(e.points) - FIBONACCI.indexOf(e.basePoints));
      const hasMatchingFactor = (e.factors ?? []).some((c) => FACTORS[c] === dir);
      if (!hasMatchingFactor) errors.push(`${spec}: adjusted ${dir > 0 ? 'up' : 'down'} with no matching factor code`);
      if (!e.justification) errors.push(`${spec}: adjustment without a justification (S13-SR-02)`);
    }
    if (!e.estimatedAt || !e.estimator) errors.push(`${spec}: missing provenance (estimator/estimatedAt, S13-SR-02)`);
    // Live drift is a re-estimation prompt, never a broken build (S13-SR-03).
    const liveBase = basePointsForLoc(live[spec].implLoc);
    if (typeof recordedLoc === 'number' && liveBase !== e.basePoints) {
      warnings.push(`${spec}: live impl LOC ${live[spec].implLoc} now suggests base ${liveBase} (estimate recorded ${e.basePoints} at ${recordedLoc} LOC) — consider re-estimating`);
    }
  }
  return { errors, warnings };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  if (process.argv.includes('--evidence')) {
    const ev = computeEvidence();
    console.log('spec  files    LOC  tests  reqs  suggested base');
    for (const [spec, e] of Object.entries(ev).sort((a, b) => a[1].implLoc - b[1].implLoc)) {
      console.log(
        `${spec.padEnd(5)}${String(e.implFiles).padStart(5)}${String(e.implLoc).padStart(7)}` +
        `${String(e.taggedTests).padStart(7)}${String(e.requirements).padStart(6)}` +
        `${String(basePointsForLoc(e.implLoc)).padStart(10)}`,
      );
    }
  } else {
    const { errors, warnings } = validate();
    console.log('Spec effort estimates (advisory)');
    console.log('─'.repeat(48));
    for (const w of warnings) console.log(`⚠ ${w}`);
    if (errors.length) {
      for (const e of errors) console.log(`✗ ${e}`);
      console.log(`\n${errors.length} error(s) — see specs/S13-spec-effort-estimation.md for the rubric.`);
      process.exit(1);
    }
    console.log(`✓ ${Object.keys(JSON.parse(readFileSync(EFFORT_PATH, 'utf-8')).specs).length} estimates valid against rubric v${RUBRIC_VERSION}.`);
  }
}
