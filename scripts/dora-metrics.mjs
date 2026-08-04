#!/usr/bin/env node
// DORA delivery-performance metrics (S14), computed entirely from git tags and
// commit history — no external service (S14-SR-06). A release tag is the unit
// of deployment for this repository; every metric is defined against the
// `vX.Y.Z` tag sequence.
//
// Usage:
//   node scripts/dora-metrics.mjs            compute and write dora.json
//   node scripts/dora-metrics.mjs --check    recompute and fail if dora.json is stale
//
// Because the source is git history itself, regeneration reconstructs the full
// timeline — there is no separate backfill and no hand-maintained history file.
// These metrics are deliberately NOT read by the maturity scorer (S14-NFR-01).
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'dora.json');
const DAY = 86400_000;

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf-8' }).trim();
const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

// ── DORA performance bands (S14-SR-05) ──────────────────────────────────────
// Published reference thresholds (State of DevOps). They target continuously-
// deployed services; a release-based extension is measured against them for
// reference only — the docs view says so.
function bandDeployFrequency(medianIntervalDays) {
  if (medianIntervalDays === null) return 'n/a';
  if (medianIntervalDays <= 1) return 'Elite'; // on-demand, multiple/day
  if (medianIntervalDays <= 7) return 'High'; // weekly–daily
  if (medianIntervalDays <= 30) return 'Medium'; // monthly–weekly
  return 'Low';
}
function bandLeadTime(days) {
  if (days === null) return 'n/a';
  if (days <= 1) return 'Elite';
  if (days <= 7) return 'High';
  if (days <= 30) return 'Medium';
  return 'Low';
}
function bandFailureRate(pct) {
  if (pct === null) return 'n/a';
  if (pct <= 5) return 'Elite';
  if (pct <= 15) return 'High'; // DORA groups 0–15% together above "low"
  if (pct <= 30) return 'Medium';
  return 'Low';
}
function bandRestore(days) {
  if (days === null) return 'n/a';
  if (days <= 1) return 'Elite';
  if (days <= 7) return 'High';
  if (days <= 30) return 'Medium';
  return 'Low';
}

// ── release inventory ───────────────────────────────────────────────────────

function parseSemver(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

/**
 * Oldest → newest release tags with their commit dates.
 *
 * Tags only, deliberately. An earlier revision also synthesised the release
 * staged in an open release-please PR, reading its version from package.json
 * and its date from the changelog — but that date is when release-please
 * *wrote* the entry, not when the tag lands, so every figure derived from it
 * (interval, lead time, restore time) was an estimate dressed up as a
 * measurement. A tag is the only thing that actually marks a deploy here
 * (S14-SR-06), so the refresh is triggered after tagging instead.
 */
function releases() {
  const lines = git("for-each-ref --sort=creatordate --format='%(refname:short)|%(creatordate:iso-strict)' refs/tags/v*")
    .split('\n')
    .filter(Boolean);
  return lines
    .map((l) => {
      const [tag, date] = l.replace(/'/g, '').split('|');
      return { tag, date, ts: Date.parse(date), semver: parseSemver(tag) };
    })
    .filter((r) => r.semver);
}

/** True when `b` is a semver patch bump over `a` (same major.minor, patch+). */
function isPatchBump(a, b) {
  return b.semver.major === a.semver.major && b.semver.minor === a.semver.minor && b.semver.patch > a.semver.patch;
}

// ── compute ─────────────────────────────────────────────────────────────────

function compute() {
  const rels = releases();
  const perRelease = [];
  const allLead = [];
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const prev = rels[i - 1];
    // Lead time: authoring→release for the commits first shipped in this tag.
    // The seed release (i === 0) has no prior deploy — it "ships" the whole
    // pre-existing history, whose ancient authoring dates aren't a delivery
    // signal — so it is excluded from lead time (its datapoint is null and its
    // commits don't enter the aggregate). It still counts as a deployment.
    const range = prev ? `${prev.tag}..${rel.tag}` : rel.tag;
    const authorTs = git(`log --format=%aI ${range}`)
      .split('\n')
      .filter(Boolean)
      .map((d) => Date.parse(d));
    const leadDays = prev ? authorTs.map((t) => (rel.ts - t) / DAY).filter((d) => d >= 0) : [];
    if (prev) for (const d of leadDays) allLead.push(d);
    const next = rels[i + 1];
    const failure = next ? isPatchBump(rel, next) : false;
    perRelease.push({
      tag: rel.tag,
      date: rel.date.slice(0, 10),
      commits: authorTs.length,
      intervalDays: prev ? round1((rel.ts - prev.ts) / DAY) : null,
      leadTimeDays: prev ? round1(median(leadDays)) : null,
      isPatch: prev ? isPatchBump(prev, rel) : false,
      failure, // this release was followed by a hotfix patch
      restoreDays: failure ? round1((next.ts - rel.ts) / DAY) : null,
    });
  }

  const intervals = perRelease.map((r) => r.intervalDays).filter((x) => x !== null);
  const failures = perRelease.filter((r) => r.failure);
  const medianInterval = round1(median(intervals));
  const medianLead = round1(median(allLead));
  const failureRate = perRelease.length ? Math.round((failures.length / perRelease.length) * 1000) / 10 : null;
  const medianRestore = round1(median(failures.map((r) => r.restoreDays)));
  const spanDays = rels.length >= 2 ? (rels[rels.length - 1].ts - rels[0].ts) / DAY : 0;
  const perWeek = spanDays > 0 ? Math.round((rels.length / (spanDays / 7)) * 10) / 10 : null;

  return {
    $comment: 'DORA delivery-performance metrics (S14) computed from git by scripts/dora-metrics.mjs — do not edit by hand. Run `npm run dora`. NEVER read by the maturity scorer.',
    generatedAt: new Date().toISOString().slice(0, 10),
    releaseCount: rels.length,
    firstRelease: rels[0]?.date.slice(0, 10) ?? null,
    lastRelease: rels[rels.length - 1]?.date.slice(0, 10) ?? null,
    metrics: {
      deploymentFrequency: {
        medianIntervalDays: medianInterval,
        perWeek,
        band: bandDeployFrequency(medianInterval),
      },
      leadTimeForChanges: { medianDays: medianLead, band: bandLeadTime(medianLead) },
      changeFailureRate: {
        percent: failureRate,
        failures: failures.length,
        of: perRelease.length,
        band: bandFailureRate(failureRate),
      },
      timeToRestore: { medianDays: medianRestore, failures: failures.length, band: bandRestore(medianRestore) },
    },
    perRelease,
  };
}

// ── output ──────────────────────────────────────────────────────────────────

const result = compute();
const serialized = JSON.stringify(result, null, 2) + '\n';

function comparable(r) {
  // Drift is judged on the metrics + per-release facts, not the generation date.
  return JSON.stringify({ metrics: r.metrics, perRelease: r.perRelease, releaseCount: r.releaseCount });
}

function printSummary(r) {
  const m = r.metrics;
  console.log(`DORA delivery performance — ${r.releaseCount} releases, ${r.firstRelease} → ${r.lastRelease}`);
  console.log('─'.repeat(60));
  console.log(`  Deployment frequency  every ${m.deploymentFrequency.medianIntervalDays}d (${m.deploymentFrequency.perWeek}/wk)  [${m.deploymentFrequency.band}]`);
  console.log(`  Lead time for changes ${m.leadTimeForChanges.medianDays}d median            [${m.leadTimeForChanges.band}]`);
  console.log(`  Change failure rate   ${m.changeFailureRate.percent}% (${m.changeFailureRate.failures}/${m.changeFailureRate.of})       [${m.changeFailureRate.band}]`);
  console.log(`  Time to restore       ${m.timeToRestore.medianDays ?? 'n/a'}${m.timeToRestore.medianDays != null ? 'd' : ''} median          [${m.timeToRestore.band}]`);
}

if (process.argv.includes('--check')) {
  printSummary(result);
  // S14-SR-09: a checkout with no tags computes zero releases, which compares
  // unequal to any committed timeline — reporting that as "stale" would blame
  // the data for a broken checkout. actions/checkout fetches no tags by
  // default, so this is the likely failure, not the unlikely one.
  if (result.releaseCount === 0) {
    console.log(
      '\n✗ No release tags are visible, so dora.json cannot be verified — this is a ' +
      'checkout problem, not stale data.\n' +
      '  Fetch tags first (`git fetch --tags`, or `fetch-depth: 0` on actions/checkout).',
    );
    process.exit(1);
  }
  let committed;
  try {
    committed = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
  } catch {
    console.log('\n✗ dora.json missing. Run `npm run dora` and commit it.');
    process.exit(1);
  }
  if (comparable(committed) !== comparable(result)) {
    console.log('\n✗ dora.json is stale (a new release landed?). Run `npm run dora` and commit it.');
    process.exit(1);
  }
  console.log('\n✓ dora.json is up to date.');
} else {
  writeFileSync(OUT_PATH, serialized);
  printSummary(result);
  console.log(`\nWrote ${OUT_PATH.replace(ROOT + '/', '')}`);
}
