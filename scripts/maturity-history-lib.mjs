// Shared helpers for the maturity score history (S12-SR-09/10): one place
// that knows a snapshot's shape, its filename convention, and what counts as
// "the scores changed". Used by scripts/maturity-score.mjs (append-on-change
// at scoring time) and scripts/backfill-maturity-history.mjs (reconstruction
// from git history) — and read, via docs/.vitepress/maturitySource.ts, by the
// docs site's evolution diagram.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/** Repository-root-relative folder holding one JSON file per score change. */
export const HISTORY_DIR = 'maturity-history';

/**
 * Project a full maturity-score.json document to a history snapshot: the
 * rounded scores only (the same granularity `--check` compares on — raw facts
 * vary across Node versions). `slugByLabel` supplies slugs for score files
 * that predate the `slug` field.
 */
export function toSnapshot(score, atIso, slugByLabel = {}) {
  return {
    at: atIso,
    scale: score.scale,
    overall: score.overall,
    dimensions: score.dimensions.map((d) => ({
      label: d.label,
      slug: d.slug ?? slugByLabel[d.label] ?? slugify(d.label),
      score: d.score,
    })),
  };
}

/** True when two snapshots carry the same rounded score state (slugs/dates ignored). */
export function sameScores(a, b) {
  const key = (s) =>
    JSON.stringify({
      scale: s.scale,
      overall: s.overall,
      dimensions: s.dimensions.map((d) => ({ label: d.label, score: d.score })),
    });
  return key(a) === key(b);
}

/** Windows-safe, lexicographically sortable filename for a snapshot instant. */
export function snapshotFileName(atIso, suffix = '') {
  const utc = new Date(atIso).toISOString().slice(0, 19).replace(/:/g, '-');
  return `${utc}Z${suffix}.json`;
}

/**
 * All snapshots in the history folder, oldest first. Batch-pushed commits can
 * share one committer timestamp, so equal `at` values tie-break on the
 * backfill's explicit `seq` (absent on scorer-written snapshots → 0).
 */
export function readHistory(rootDir) {
  const dir = join(rootDir, HISTORY_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.seq ?? 0) - (b.seq ?? 0)));
}

function slugify(label) {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
}
