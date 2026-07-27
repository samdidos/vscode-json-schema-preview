// S14-SR-08/09 — the DORA snapshot must be refreshed when a release happens,
// and its checker must not blame the data for a checkout that cannot see tags.
import * as assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const script = read('scripts/dora-metrics.mjs');
const refresh = read('.github/workflows/maturity-refresh.yml');
const dora = JSON.parse(read('dora.json'));

/** Newest `vX.Y.Z` tag reachable from this checkout, oldest→newest by
 *  creation date (mirrors scripts/dora-metrics.mjs's own ordering), or
 *  undefined when no tags are visible (shallow-clone hazard, S14-SR-09). */
function latestVisibleTag(): string | undefined {
  const out = execFileSync(
    'git',
    ['for-each-ref', '--sort=creatordate', "--format=%(refname:short)", 'refs/tags/v*'],
    { cwd: ROOT, encoding: 'utf-8' },
  );
  const tags = out.split('\n').filter(Boolean);
  return tags[tags.length - 1];
}

suite('S14 — delivery-metric freshness', () => {
  test('[S14-SR-08] the refresh runs after a release, not only on a schedule', () => {
    // The whole trigger block, before the first job.
    const triggers = refresh.slice(refresh.indexOf('on:'), refresh.indexOf('jobs:'));
    assert.match(triggers, /workflow_run/, 'a release must trigger the refresh');
    assert.match(triggers, /Release Please/);
    assert.match(triggers, /schedule/, 'the periodic refresh stays as a backstop');
    // A failed release produced no tag, so there is nothing to recompute.
    assert.match(refresh, /workflow_run\.conclusion == 'success'/);
  });

  test('[S14-SR-08] the committed snapshot covers the released version', () => {
    // The reason this requirement exists: dora.json sat three releases behind
    // the shipped extension, so the published Delivery view under-reported.
    //
    // Compared against the actual latest git tag, not package.json's version:
    // a release-please PR bumps package.json ahead of tagging (the tag lands
    // only once that PR merges), so package.json alone can't tell a release
    // that's merely pending from a snapshot that's truly stale. When no tag
    // is visible at all (the shallow-checkout hazard S14-SR-09 already
    // handles for the CLI checker), there is nothing to compare against, so
    // this check is skipped rather than blamed on the data.
    const latestTag = latestVisibleTag();
    if (!latestTag) {
      return;
    }
    const tags = (dora.perRelease as { tag: string }[]).map((r) => r.tag);
    assert.ok(
      tags.includes(latestTag),
      `dora.json ends at ${tags[tags.length - 1]} but the latest release tag is ${latestTag} — run \`npm run dora\``,
    );
    assert.equal(dora.releaseCount, tags.length);
  });

  test('[S14-SR-09] a tagless checkout is reported as a checkout problem, not staleness', () => {
    const check = script.slice(script.indexOf("process.argv.includes('--check')"));
    // The zero-tag branch must come BEFORE the staleness comparison, or the
    // comparison reports "stale" for data it simply cannot see.
    const zeroTags = check.indexOf('releaseCount === 0');
    const staleness = check.indexOf('is stale');
    assert.ok(zeroTags > -1, 'the checker must detect a tagless checkout');
    assert.ok(zeroTags < staleness, 'the tagless check must precede the staleness comparison');
    assert.match(check, /checkout problem, not stale data/);
    assert.match(check, /fetch-depth: 0|fetch --tags/);
  });

  test('[S14-SR-08] every metric derives from tags, never from wall-clock now', () => {
    // This is what makes a release the correct refresh trigger — and what makes
    // a staleness check safe to run, since nothing drifts between releases.
    const start = script.indexOf('const spanDays');
    const compute = script.slice(start, script.indexOf('return {', start));
    assert.match(compute, /rels\[rels\.length - 1\]\.ts - rels\[0\]\.ts/);
    assert.ok(
      !/Date\.now\(\)/.test(compute),
      'perWeek must divide by the tag span, not by time since the first release',
    );
  });
});
