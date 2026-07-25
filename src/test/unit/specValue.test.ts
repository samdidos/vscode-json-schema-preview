// S16 — advisory customer-value estimates. These tests are the mechanical
// guarantee that specs/value.json cannot drift from the calibration chart.
//
// The chart constants are deliberately restated here rather than imported from
// scripts/spec-value.mjs: the script is the authority (S16-SR-04) and this is
// an INDEPENDENT cross-check of it, double-entry style. Importing the script's
// own numbers would make the derivation tests tautological.
import * as assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const value = JSON.parse(read('specs/value.json'));
const effort = JSON.parse(read('specs/effort.json'));
const script = read('scripts/spec-value.mjs');

const FACTOR_DIR: Record<string, number> = {
  ZEROCONF: 1, UNIQUE: 1, GATEWAY: 1, CI: 1,
  DEP: -1, OVERLAP: -1, NARROW: -1,
};
const TIERS: [number, string][] = [
  [20, 'Critical'], [12, 'High'], [6, 'Moderate'], [2.5, 'Niche'], [0, 'Marginal'],
];
const CONFIDENCES = [1, 0.8, 0.5];

const featureSpecIds = () =>
  readdirSync(resolve(ROOT, 'specs'))
    .filter((n) => /^F\d{2}-.*\.md$/.test(n))
    .map((n) => n.slice(0, 3))
    .sort();

const entries = () => Object.entries(value.features) as [string, Record<string, never>][];

suite('S16 — feature value estimation', () => {
  test('[S16-SR-01] every feature spec carries a value estimate', () => {
    const scored = Object.keys(value.features).sort();
    assert.deepEqual(scored, featureSpecIds());
  });

  test('[S16-SR-01] every dimension sits on its enumerated scale', () => {
    for (const [id, v] of entries()) {
      const reach = Number(v.reach);
      const impact = Number(v.impact);
      assert.ok(Number.isInteger(reach) && reach >= 1 && reach <= 5, `${id}: reach ${reach}`);
      assert.ok(Number.isInteger(impact) && impact >= 1 && impact <= 5, `${id}: impact ${impact}`);
      assert.ok(CONFIDENCES.includes(Number(v.confidence)), `${id}: confidence ${v.confidence}`);
    }
  });

  test('[S16-SR-01] score and tier derive from the chart, independently recomputed', () => {
    for (const [id, v] of entries()) {
      const factors = (v.factors ?? []) as unknown as string[];
      const sum = factors.reduce((s, c) => s + FACTOR_DIR[c], 0);
      const net = Math.max(-2, Math.min(2, sum));
      const raw = Number(v.reach) * Number(v.impact) * Number(v.confidence);
      const expected = Math.round(raw * (1 + 0.1 * net) * 100) / 100;
      assert.equal(Number(v.score), expected, `${id}: stored score disagrees with the chart`);
      const tier = TIERS.find(([min]) => expected >= min)![1];
      assert.equal(v.tier, tier, `${id}: stored tier disagrees with score ${expected}`);
    }
  });

  test('[S16-SR-02] every estimate carries factors, justification and provenance', () => {
    for (const [id, v] of entries()) {
      assert.ok(Array.isArray(v.factors), `${id}: factors must be an array`);
      for (const code of v.factors as unknown as string[]) {
        assert.ok(code in FACTOR_DIR, `${id}: unknown factor code ${code}`);
      }
      assert.ok(String(v.justification).length > 20, `${id}: justification too thin`);
      assert.ok(v.estimator, `${id}: missing estimator`);
      assert.match(String(v.estimatedAt), /^\d{4}-\d{2}-\d{2}$/, `${id}: bad estimatedAt`);
    }
    assert.equal(value.rubricVersion, 1);
  });

  test('[S16-SR-03] the validator is wired into the mandatory verify gate', async () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.scripts['check:spec-value'], 'node scripts/spec-value.mjs');
    // S17: `verify` runs scripts/verify.mjs's concurrent orchestrator rather
    // than a `&&`-chain, so the wiring check is against its step list instead
    // of pattern-matching the (now one-line) verify script string.
    assert.equal(pkg.scripts.verify, 'node scripts/verify.mjs');
    const { STEPS } = await (import('../../../scripts/verify.mjs') as Promise<{ STEPS: string[] }>);
    assert.ok(STEPS.includes('check:spec-value'));
  });

  test('[S16-SR-04] the calibration constants are declared once in the validator', () => {
    for (const name of ['REACH', 'IMPACT', 'CONFIDENCE', 'FACTORS', 'TIERS', 'STEP_WEIGHT', 'MAX_FACTOR_STEPS']) {
      const declarations = script.match(new RegExp(`^export const ${name} =`, 'gm')) ?? [];
      assert.equal(declarations.length, 1, `${name} must be declared exactly once`);
    }
  });

  test('[S16-SR-05] RICE is never stored; effort.json stays the divisor source', () => {
    for (const [id, v] of entries()) {
      assert.ok(!('rice' in v), `${id}: rice must not be stored`);
      assert.ok(!('points' in v), `${id}: effort points must not be duplicated here`);
    }
    assert.match(script, /effort\.json/);
  });

  test('[S16-SR-05] every scored feature has an effort estimate to divide by', () => {
    for (const [id] of entries()) {
      assert.ok(effort.specs[id]?.points, `${id}: no effort points, RICE cannot be computed`);
    }
  });

  test('[S16-SR-06] no system spec is scored for customer value', () => {
    for (const [id] of entries()) {
      assert.match(id, /^F\d{2}$/, `${id}: only feature specs may carry a value estimate`);
    }
  });

  test('[S16-SR-07] the docs surface renders the estimate and links to the rubric', () => {
    const component = read('docs/.vitepress/theme/SpecValue.vue');
    assert.match(component, /advisory/i);
    assert.match(component, /S16/);
    assert.match(read('docs/.vitepress/theme/index.ts'), /app\.component\('SpecValue', SpecValue\)/);
    assert.match(read('docs/specs/[id].md'), /<SpecValue \/>/);
  });

  test('[S16-NFR-01] the maturity scorer never reads the value estimates', () => {
    assert.ok(!read('scripts/maturity-score.mjs').includes('value.json'));
  });

  test('[S16-NFR-02] the validator is dependency-free plain Node', () => {
    const imports = [...script.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(/^(fs|path|url|node:)/.test(spec), `third-party or non-core import: ${spec}`);
    }
  });

  test('[S16-NFR-03] scoring needs no telemetry: the validator makes no network call', () => {
    assert.ok(!/https?:\/\/[^\s'"]*\$\{/.test(script), 'no dynamic URL construction');
    for (const banned of ['fetch(', 'require(\'https\')', 'from \'https\'', 'XMLHttpRequest']) {
      assert.ok(!script.includes(banned), `validator must not reach the network: ${banned}`);
    }
  });
});
