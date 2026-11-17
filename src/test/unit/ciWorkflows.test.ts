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

suite('S09 — a dependency change cannot break the mutation run unseen', () => {
  const ci = directivesOf(read('.github/workflows/ci.yml'));
  const detect = read('scripts/ci-detect-source-changes.sh');

  test('[S09-SR-11] ci.yml dry-runs Stryker, gated on the shared `deps` output', () => {
    const start = ci.indexOf('\n  mutation-smoke:\n');
    assert.notEqual(start, -1, 'ci.yml has a mutation-smoke job');
    const job = ci.slice(start);
    assert.match(job, /needs: changes\n\s+if: needs\.changes\.outputs\.deps == 'true'/);
    assert.match(job, /run: npm run test:mutation:smoke/);
    assert.match(ci, /deps: \$\{\{ steps\.filter\.outputs\.deps \}\}/);
    const scripts = JSON.parse(read('package.json')).scripts;
    assert.equal(scripts['test:mutation:smoke'], 'stryker run --dryRunOnly');
  });

  test('[S09-SR-11] `deps` is true exactly for the manifest, the lockfile and the Stryker config', () => {
    const source = /DEPS_PATTERN='([^']+)'/.exec(detect)?.[1];
    assert.ok(source, 'the detection script defines DEPS_PATTERN');
    const pattern = new RegExp(source);
    for (const hit of ['package.json', 'package-lock.json', 'stryker.config.json']) {
      assert.ok(pattern.test(hit), `${hit} triggers the dry run`);
    }
    for (const miss of ['docs/package-lock.json', 'src/extension.ts', 'README.md', 'package.json.bak', 'tsconfig.json']) {
      assert.ok(!pattern.test(miss), `${miss} does not trigger the dry run`);
    }
    assert.match(detect, /echo "deps=\$deps_result"/);
  });
});

suite('S18 — the scheduled mutation run keeps the published score current', () => {
  const mutation = directivesOf(read('.github/workflows/mutation.yml'));
  /** The YAML of one top-level job, up to the next job or the end of file. */
  const job = (name: string) => {
    const start = mutation.indexOf(`\n  ${name}:\n`);
    assert.notEqual(start, -1, `mutation.yml has a ${name} job`);
    const rest = mutation.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };

  test('[S18-SR-06] incremental results are restored before the run and saved after it, even on failure', () => {
    const stryker = job('stryker');
    const incrementalFile = JSON.parse(read('stryker.config.json')).incrementalFile;
    const restore = stryker.indexOf('actions/cache/restore@');
    const run = stryker.indexOf('npm run test:mutation');
    const save = stryker.indexOf('actions/cache/save@');
    assert.ok(restore !== -1 && restore < run && run < save, 'restore → run → save, in that order');
    // Both steps must name the file Stryker is configured to write.
    assert.equal(stryker.split(`path: ${incrementalFile}`).length - 1, 2);
    assert.match(stryker, /if: always\(\) && hashFiles\('reports\/stryker-incremental\.json'\) != ''/);
  });

  test('[S18-SR-06] results are never reused across a Stryker config change, and a full run can be forced', () => {
    const stryker = job('stryker');
    assert.match(stryker, /key: stryker-incremental-\$\{\{ hashFiles\('stryker\.config\.json'\) \}\}-\$\{\{ github\.run_id \}\}/);
    assert.match(stryker, /restore-keys: \|\n\s+stryker-incremental-\$\{\{ hashFiles\('stryker\.config\.json'\) \}\}-\n/);
    assert.match(mutation, /workflow_dispatch:\n\s+inputs:\n\s+full:/);
    assert.match(stryker, /npm run test:mutation -- --force/);
  });

  test('[S18-SR-07] the write token lives only in the job that publishes, which runs nothing from the repo', () => {
    const stryker = job('stryker');
    const publish = job('publish');
    assert.doesNotMatch(stryker, /contents: write|pull-requests: write/);
    assert.match(mutation, /^permissions:\n {2}contents: read$/m);
    assert.match(publish, /permissions:\n\s+contents: write\n\s+pull-requests: write/);
    assert.doesNotMatch(publish, /npm (ci|install|run|test)|npx /);
  });

  test('[S18-SR-07] the score is proposed as a pull request from the default branch only, never pushed to it', () => {
    const publish = job('publish');
    assert.match(publish, /if: always\(\) && github\.ref_name == github\.event\.repository\.default_branch/);
    assert.match(publish, /BRANCH=chore\/refresh-mutation-score/);
    assert.match(publish, /git push --force origin "\$BRANCH"/);
    assert.match(publish, /gh pr create/);
    // Published when the scores moved or the committed date is two weeks old.
    assert.match(publish, /scores\(fresh\) !== scores\(committed\) \|\| !\(ageDays < 14\)/);
  });
});
