// Enforce the `Fixes:` trailer on fix commits (S19-SR-01/02/03).
//
// Usage (from .husky/commit-msg):
//   node scripts/check-fix-trailer.mjs "$1"
//
// Reads only the commit message and the traceability matrix (S19-NFR-02), so
// it behaves the same on a commit, an amend, and a rebase.
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX_PATH = join(ROOT, 'specs', 'traceability.json');

/** Conventional-commit header: type(scope)!: subject */
const HEADER_RE = /^(?<type>\w+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s/;
/** A requirement id, e.g. F07-FR-03 or S10-SR-14. */
export const REQ_ID_RE = /^[FS]\d{2}-(?:FR|NFR|SR)-\d+$/;
/** Scopes exempt from attribution (S19-SR-03): a dependency advisory patch
 *  repairs no requirement of this project. */
export const EXEMPT_SCOPES = new Set(['deps']);

/** Trailer lines are `Key: value`; we accept any casing of the key. */
export function parseFixesTrailers(message) {
  const ids = [];
  for (const line of message.split(/\r?\n/)) {
    const m = /^fixes:\s*(.+?)\s*$/i.exec(line.trim());
    if (!m) continue;
    for (const part of m[1].split(',')) {
      const id = part.trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}

/** Returns a list of human-readable problems; empty means the message is fine. */
export function checkMessage(message, knownIds) {
  // Comment lines are stripped by git before the message is stored, but the
  // hook sees the raw file — drop them so a commented-out trailer never counts.
  const body = message
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('#'))
    .join('\n');
  const header = body.trim().split(/\r?\n/)[0] ?? '';
  const match = HEADER_RE.exec(header);
  if (!match || match.groups.type !== 'fix') return [];
  if (EXEMPT_SCOPES.has(match.groups.scope ?? '')) return [];

  const ids = parseFixesTrailers(body);
  if (ids.length === 0) {
    return [
      'a `fix:` commit must record what it repaired with a `Fixes:` trailer (S19-SR-01), e.g.\n' +
      '\n    Fixes: F07-FR-03\n\n' +
      'If no requirement describes the behaviour being fixed, specify it first — ' +
      'that gap is the finding, not an exemption (S19-SR-03).\n' +
      'Dependency patches are exempt: use the `deps` scope, e.g. `fix(deps): …`.',
    ];
  }
  const problems = [];
  for (const id of ids) {
    if (!REQ_ID_RE.test(id)) {
      problems.push(`"${id}" is not a requirement id (expected e.g. F07-FR-03)`);
    } else if (knownIds && !knownIds.has(id)) {
      problems.push(`"${id}" is not in specs/traceability.json — typo, or the requirement is missing`);
    }
  }
  return problems;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error('check-fix-trailer: pass the path to the commit message file.');
    process.exit(1);
  }
  let knownIds;
  if (existsSync(MATRIX_PATH)) {
    knownIds = new Set(Object.keys(JSON.parse(readFileSync(MATRIX_PATH, 'utf-8')).requirements ?? {}));
  }
  const problems = checkMessage(readFileSync(file, 'utf-8'), knownIds);
  if (problems.length) {
    console.error('\n✗ Commit rejected — defect attribution (S19):\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error('');
    process.exit(1);
  }
}
