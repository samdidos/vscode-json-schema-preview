// S14-SR-08/09 — the DORA snapshot must be refreshed when a release happens,
// and its checker must not blame the data for a checkout that cannot see tags.
import * as assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const script = read('scripts/dora-metrics.mjs');
const refresh = read('.github/workflows/maturity-refresh.yml');
const dora = JSON.parse(read('dora.json'));
const pkg = JSON.parse(read('package.json'));

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
    const shipped = `v${pkg.version}`;
    const tags = (dora.perRelease as { tag: string }[]).map((r) => r.tag);
    assert.ok(
      tags.includes(shipped),
      `dora.json ends at ${tags[tags.length - 1]} but package.json is ${shipped} — run \`npm run dora\``,
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
