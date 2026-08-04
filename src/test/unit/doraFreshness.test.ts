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
  test('[S14-SR-08] the refresh runs on a release, not only on a schedule', () => {
    // The whole trigger block, before the first job.
    const triggers = refresh.slice(refresh.indexOf('on:'), refresh.indexOf('jobs:'));
    assert.match(triggers, /workflow_run/, 'a release must trigger the refresh');
    assert.match(triggers, /Release Please/);
    assert.match(triggers, /schedule/, 'the periodic refresh stays as a backstop');
    // A failed release run leaves a PR we must not commit onto.
    assert.match(refresh, /workflow_run\.conclusion/, 'a failed release must not refresh');
    // The release path commits into release-please's own open PR, so the
    // release ships carrying its own metrics instead of trailing a catch-up
    // PR behind it. An open release-please PR is the signal that a release is
    // being prepared; without one there is nothing staged to refresh.
    assert.match(
      refresh,
      /startswith\("release-please--"\)/,
      'the release path must target the open release-please PR',
    );
    assert.match(
      refresh,
      /HEAD:\$TARGET_BRANCH/,
      'the refresh must be committed onto that PR branch',
    );
    assert.match(
      refresh,
      /needs\.plan\.outputs\.mode != 'skip'/,
      'the refresh job must be gated on the planned mode',
    );
  });

  test('[S14-SR-08] the scheduled backstop stands down after a recent release', () => {
    // With releases refreshing these files in their own PR, a periodic run
    // that fired anyway would re-open a PR whose only real delta is the
    // generatedAt date — the exact churn this job exists to avoid.
    assert.match(refresh, /cron: '0 9 1,15 \* \*'/, 'the backstop runs bi-weekly');
    const plan = refresh.slice(refresh.indexOf('id: decide'), refresh.indexOf('refresh:'));
    assert.match(plan, /refs\/tags\/v\*/, 'recency must be judged from release tags');
    assert.match(plan, /-lt 14/, 'a release inside the fortnight must skip the backstop');
  });

  test('[S14-SR-10] a pending, untagged release is folded into the snapshot', () => {
    // The release path computes inside the release PR, where release-please
    // has bumped package.json and written the changelog but has NOT tagged —
    // the tag lands only on merge. Tags alone would therefore end one release
    // short and be stale the instant the tag appeared.
    const fn = script.slice(script.indexOf('function pendingRelease'), script.indexOf('/** Oldest → newest releases,'));
    assert.match(fn, /package\.json/, "the pending version comes from package.json");
    assert.match(fn, /CHANGELOG\.md/, 'its date comes from the changelog entry');
    // Both signals required, so a hand-edited bump cannot invent a release.
    assert.match(
      fn,
      /if \(tagged\.some\(\(r\) => r\.tag === tag\)\) return null;/,
      'an already-tagged version must synthesise nothing',
    );
    assert.match(fn, /if \(!dated\) return null;/, 'no changelog entry must synthesise nothing');
    // The changelog heading must be matched with a fixed pattern and compared
    // by value. Interpolating the version into a pattern needs escaping, and
    // escaping only the dots leaves every other metacharacter live
    // (CodeQL js/incomplete-sanitization).
    assert.ok(
      !/new RegExp/.test(fn),
      'the heading pattern must be static, not built from the version string',
    );
    // A synthesised release has no tag to resolve, so commit ranges must use
    // a ref (HEAD) rather than the tag name.
    assert.match(script, /prev\.ref\}\.\.\$\{rel\.ref\}/, 'ranges must resolve via ref, not tag');
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
