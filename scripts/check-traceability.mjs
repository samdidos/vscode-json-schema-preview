#!/usr/bin/env node
// Requirement traceability checker.
//
// Cross-references three sources and reports drift between them:
//   1. specs/*.md            — the authoritative requirement IDs (bold defs)
//   2. specs/traceability.json — declared status + implementation pointers
//   3. src/test/**/*.ts      — `[ID]` tags in suite/test titles (coverage)
//
// Test coverage is *derived* by scanning for `[ID]` tags, so the matrix never
// has to list test names — it only declares intent (status) and impl files.
//
// Usage:
//   node scripts/check-traceability.mjs           validate, exit 1 on errors
//   node scripts/check-traceability.mjs --init     scaffold missing entries
//
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS_DIR = join(ROOT, 'specs');
const TEST_DIR = join(ROOT, 'src', 'test');
const MATRIX_PATH = join(SPECS_DIR, 'traceability.json');

const REQ_ID = '[FS]\\d{2}-(?:FR|NFR|SR)-\\d+';
const DEF_RE = new RegExp(`\\*\\*(${REQ_ID})\\*\\*`, 'g'); // **F10-FR-01** at definition site
const TAG_RE = new RegExp(`\\[(${REQ_ID})\\]`, 'g');       // [F10-FR-01] in a test title

// Statuses that the matrix entries may declare.
const STATUSES = {
  untracked: 'predates the traceability system — needs backfill',
  planned: 'specified, not yet implemented',
  implemented: 'code exists; expects unit-test coverage',
  manual: 'VS Code API-bound; verified by manual / E2E testing only',
  deferred: 'explicitly out of scope / future work',
};

// --- helpers ---------------------------------------------------------------

function walk(dir, filter, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }
  return acc;
}

// Natural sort so F02 < F10 and FR-2 < FR-10.
function naturalCompare(a, b) {
  const split = s => s.split(/(\d+)/).map(p => (/^\d+$/.test(p) ? Number(p) : p));
  const [pa, pb] = [split(a), split(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

function matchAll(text, re) {
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

// --- gather sources --------------------------------------------------------

function collectSpecRequirements() {
  const reqs = new Map(); // id -> spec filename
  const files = walk(SPECS_DIR, f => f.endsWith('.md'));
  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    for (const id of matchAll(text, DEF_RE)) {
      if (!reqs.has(id)) reqs.set(id, relative(ROOT, file));
    }
  }
  return reqs;
}

function collectTestTags() {
  const tags = new Map(); // id -> [test files]
  const files = walk(TEST_DIR, f => f.endsWith('.ts'));
  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    for (const id of matchAll(text, TAG_RE)) {
      if (!tags.has(id)) tags.set(id, []);
      const list = tags.get(id);
      const rel = relative(ROOT, file);
      if (!list.includes(rel)) list.push(rel);
    }
  }
  return tags;
}

function loadMatrix() {
  if (!existsSync(MATRIX_PATH)) {
    return { requirements: {} };
  }
  return JSON.parse(readFileSync(MATRIX_PATH, 'utf-8'));
}

function saveMatrix(matrix, specReqs) {
  const sorted = {};
  for (const id of [...Object.keys(matrix.requirements)].sort(naturalCompare)) {
    const e = matrix.requirements[id];
    sorted[id] = { status: e.status, impl: e.impl ?? [], note: e.note ?? '' };
  }
  const out = {
    $comment:
      'Requirement traceability matrix. Keys are requirement IDs defined in ' +
      'specs/*.md. status is one of: ' + Object.keys(STATUSES).join(', ') + '. ' +
      'impl lists source files; test coverage is auto-discovered from [ID] ' +
      'tags in src/test. Run `npm run check:traceability` to validate.',
    statuses: STATUSES,
    requirements: sorted,
  };
  writeFileSync(MATRIX_PATH, JSON.stringify(out, null, 2) + '\n');
}

// --- main ------------------------------------------------------------------

const init = process.argv.includes('--init');
const specReqs = collectSpecRequirements();
const testTags = collectTestTags();
const matrix = loadMatrix();
matrix.requirements ??= {};

if (init) {
  let added = 0;
  for (const id of specReqs.keys()) {
    if (!matrix.requirements[id]) {
      matrix.requirements[id] = { status: 'untracked', impl: [], note: '' };
      added++;
    }
  }
  saveMatrix(matrix, specReqs);
  console.log(`Scaffolded ${added} new requirement(s) into ${relative(ROOT, MATRIX_PATH)}.`);
  console.log(`Matrix now tracks ${Object.keys(matrix.requirements).length} of ${specReqs.size} requirements.`);
  process.exit(0);
}

const errors = [];
const warnings = [];

// 1. Every spec requirement must have a matrix entry.
for (const [id, file] of specReqs) {
  if (!matrix.requirements[id]) {
    errors.push(`${id} (defined in ${file}) has no entry in traceability.json — run with --init`);
  }
}

// 2. Every matrix entry must reference a real requirement, have a valid status,
//    and any listed impl files must exist.
for (const [id, entry] of Object.entries(matrix.requirements)) {
  if (!specReqs.has(id)) {
    errors.push(`${id} is in traceability.json but no longer defined in any spec (orphan entry)`);
    continue;
  }
  if (!STATUSES[entry.status]) {
    errors.push(`${id} has unknown status "${entry.status}" (expected one of: ${Object.keys(STATUSES).join(', ')})`);
  }
  for (const impl of entry.impl ?? []) {
    if (!existsSync(join(ROOT, impl))) {
      errors.push(`${id} lists impl "${impl}" but that file does not exist`);
    }
  }
}

// 3. Every [ID] tag in tests must reference a real requirement.
for (const id of testTags.keys()) {
  if (!specReqs.has(id)) {
    errors.push(`test tag [${id}] does not match any requirement defined in specs (stale or typo)`);
  }
}

// 4. Coverage warnings (do not fail the build).
for (const [id, entry] of Object.entries(matrix.requirements)) {
  if (!specReqs.has(id)) continue;
  const hasTest = testTags.has(id);
  if (entry.status === 'implemented' && !hasTest) {
    warnings.push(`${id} is "implemented" but no [${id}] test tag was found`);
  }
  if ((entry.status === 'implemented' || entry.status === 'manual') && (entry.impl ?? []).length === 0) {
    warnings.push(`${id} is "${entry.status}" but lists no impl file`);
  }
  if (entry.status === 'planned' && hasTest) {
    warnings.push(`${id} is "planned" but a [${id}] test tag already exists — promote to implemented?`);
  }
}

// --- report ----------------------------------------------------------------

const byStatus = {};
for (const e of Object.values(matrix.requirements)) {
  byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
}
const covered = [...specReqs.keys()].filter(id => testTags.has(id)).length;

console.log('Requirement traceability');
console.log('─'.repeat(48));
console.log(`Requirements in specs : ${specReqs.size}`);
console.log(`Tracked in matrix     : ${Object.keys(matrix.requirements).length}`);
console.log(`With test coverage    : ${covered} (${Math.round((covered / specReqs.size) * 100)}%)`);
console.log('By status             :');
for (const [s, n] of Object.entries(byStatus).sort()) {
  console.log(`  ${s.padEnd(13)} ${n}`);
}

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} error(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  console.log('\nTraceability check failed.');
  process.exit(1);
}

console.log('\n✓ Traceability check passed.');
