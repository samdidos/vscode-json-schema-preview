// S09 — CI must run the same checks the local gate does, and must never
// report a job green when it failed.
import * as assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const WORKFLOW_DIR = resolve(ROOT, '.github/workflows');
const workflows = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));

/** Whole-line YAML comments are prose, not configuration: a workflow that
 *  explains why it avoids a directive must not read as using it. */
const directivesOf = (yaml: string) =>
  yaml.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');

suite('S09 — CI workflow guarantees', () => {
  test('[S09-SR-08] no workflow uses continue-on-error', () => {
    const offenders = workflows.filter((f) =>
      /continue-on-error:\s*true/.test(directivesOf(read(`.github/workflows/${f}`))),
    );
    assert.deepEqual(
      offenders,
      [],
      'continue-on-error reports a failed job as green, so the failure is invisible ' +
      `in the checks list and to any policy built on it — use branch protection instead: ${offenders.join(', ')}`,
    );
  });

  test('[S09-SR-08] the scorer detects the directive but ignores prose about it', () => {
    const scorer = read('scripts/maturity-score.mjs');
    assert.match(scorer, /withoutYamlComments\(read\(f\)\)/);
    // The helper must strip comment lines and keep directives.
    assert.equal(directivesOf('# continue-on-error: true\nfoo: 1').trim(), 'foo: 1');
    assert.match(directivesOf('  continue-on-error: true'), /continue-on-error/);
  });

  test('[S09-SR-07] every mandatory local-gate step is reachable in CI', () => {
    const ci = read('.github/workflows/ci.yml');
    const verify = read('scripts/verify.mjs');
    // The steps `npm run verify` runs, as named in the runner itself.
    const steps = [...verify.matchAll(/'(check:[a-z-]+|lint|lint:workflows|type-check|test:coverage)'/g)]
      .map((m) => m[1]);
    assert.ok(steps.length >= 8, 'expected to discover the verify step list');
    for (const step of new Set(steps)) {
      // lint:workflows is satisfied by ci.yml's own actionlint job (S09-SR-05)
      // rather than a duplicate npm step.
      if (step === 'lint:workflows') {
        assert.match(ci, /actionlint/, 'workflow linting must still run in CI');
        continue;
      }
      assert.ok(
        ci.includes(`npm run ${step}`),
        `${step} runs in the local gate but in no CI job — a --no-verify commit would skip it`,
      );
    }
  });

  test('[S09-SR-01] the spec-checks job stays unconditional', () => {
    const ci = read('.github/workflows/ci.yml');
    const job = ci.slice(ci.indexOf('  traceability:'), ci.indexOf('  lint:'));
    assert.ok(!/^\s*if:/m.test(job), 'the spec-checks job must not be path-scoped');
    for (const step of ['check:traceability', 'check:doc-traceability']) {
      assert.ok(job.includes(step), `${step} must run in the unconditional job`);
    }
  });
});
