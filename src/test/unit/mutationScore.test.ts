// S18 — the mutation score is published as a committed, auditable artifact.
//
// The score formula is deliberately restated here rather than imported from
// scripts/mutation-score.mjs: the script is the authority (S18-SR-02) and this
// is an INDEPENDENT cross-check of it, double-entry style, exactly as
// specValue.test.ts cross-checks the value rubric. Importing the script's own
// arithmetic would make the derivation test tautological.
import * as assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const script = read('scripts/mutation-score.mjs');
const stryker = JSON.parse(read('stryker.config.json'));
const pkg = JSON.parse(read('package.json'));

const ARTIFACT = 'mutation-score.json';
const DETECTED = ['Killed', 'Timeout'];
const UNDETECTED = ['Survived', 'NoCoverage'];

/** The mutation-testing standard, restated independently of the script. */
function expectedScore(tallies: Record<string, number>): number | null {
  const hit = DETECTED.reduce((n, s) => n + (tallies[s] ?? 0), 0);
  const miss = UNDETECTED.reduce((n, s) => n + (tallies[s] ?? 0), 0);
  return hit + miss === 0 ? null : Math.round((hit / (hit + miss)) * 1000) / 10;
}

suite('S18 — mutation score publication', () => {
  test('[S18-SR-01] a generator turns the Stryker report into a committed artifact', () => {
    assert.match(script, /reports[/\\]?['"/,\s]*mutation/);
    assert.match(script, /mutation-score\.json/);
    assert.match(script, /\$comment/);
    // Stryker must actually emit the JSON the generator reads.
    assert.ok(stryker.reporters.includes('json'), 'stryker must enable the json reporter');
    assert.match(String(stryker.jsonReporter?.fileName), /mutation\.json$/);
    assert.equal(pkg.scripts['mutation:score'], 'node scripts/mutation-score.mjs');
  });

  test('[S18-SR-02] the score formula is the mutation-testing standard', () => {
    for (const status of DETECTED) {
      assert.ok(script.includes(status), `${status} must count as detected`);
    }
    for (const status of UNDETECTED) {
      assert.ok(script.includes(status), `${status} must count against the score`);
    }
    // Errors and ignored mutants say nothing about test strength and must not
    // enter the denominator.
    for (const status of ['CompileError', 'RuntimeError', 'Ignored']) {
      assert.ok(script.includes(status), `${status} must be excluded from the denominator`);
    }
  });

  test('[S18-SR-03] provenance is recorded so a stale score is visibly stale', () => {
    assert.match(script, /generatedAt/);
    assert.match(script, /breakThreshold/);
    // The docs surface must show the date beside the chart.
    assert.match(read('docs/.vitepress/theme/SpecInsights.vue'), /provenance\.generatedAt/);
  });

  test('[S18-SR-04] publishing is never wired into the mandatory gate', () => {
    const verify = read('scripts/verify.mjs');
    assert.ok(!/mutation/i.test(verify), 'npm run verify must not run a mutation step');
    assert.ok(
      !/mutation:score|test:mutation/.test(String(pkg.scripts.verify)),
      'the verify script must not invoke mutation testing',
    );
    // The docs loader must treat an absent artifact as "not measured".
    const loader = read('docs/.vitepress/specs.data.ts');
    assert.match(loader, /existsSync\(mutationPath\)/);
    assert.match(loader, /: null/);
  });

  test('[S18-SR-05] files excluded from mutation are absent, not zeroed', () => {
    assert.match(script, /if \(mutants === 0\) continue/);
    if (!exists(ARTIFACT)) {return;} // not measured yet — S18-SR-04
    const artifact = JSON.parse(read(ARTIFACT));
    const excluded = (stryker.mutate as string[])
      .filter((p) => p.startsWith('!'))
      .map((p) => p.slice(1));
    for (const path of Object.keys(artifact.files)) {
      assert.ok(!excluded.includes(path), `${path} is excluded from mutation but appears in the artifact`);
    }
  });

  test('[S18-SR-02] every stored score recomputes from its own tallies', () => {
    if (!exists(ARTIFACT)) {return;} // not measured yet — S18-SR-04
    const artifact = JSON.parse(read(ARTIFACT));
    for (const [path, entry] of Object.entries(artifact.files) as [string, {
      mutants: number; tallies: Record<string, number>; score: number | null;
    }][]) {
      assert.equal(entry.score, expectedScore(entry.tallies), `${path} score contradicts its tallies`);
      const summed = Object.values(entry.tallies).reduce((a, b) => a + b, 0);
      assert.equal(entry.mutants, summed, `${path} mutant count contradicts its tallies`);
    }
    assert.equal(
      artifact.overall.score,
      expectedScore(artifact.overall.tallies),
      'overall score contradicts its tallies',
    );
  });

  test('[S18-NFR-01] the generator is plain Node with no third-party imports', () => {
    const imports = [...script.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(
        spec.startsWith('node:') || ['fs', 'path', 'url'].includes(spec),
        `unexpected dependency: ${spec}`,
      );
    }
  });

  test('[S18-NFR-02] the maturity scorer never reads the mutation score', () => {
    const scorer = read('scripts/maturity-score.mjs');
    assert.ok(
      !scorer.includes('mutation-score.json'),
      'maturity must not depend on an on-demand artifact',
    );
  });
});
