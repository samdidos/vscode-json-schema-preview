// S12-SR-15 — a maturity check's detection predicate must track the artifact
// it measures.
//
// A predicate that names a path is a standing hostage to renames, and a check
// that stops finding its artifact scores a silent 0 rather than failing. That
// is not hypothetical: when the agent hooks were ported from shell to Node
// (S15 requires .mjs), five predicates kept looking for the .sh names and
// quietly scored 0, so the scorer penalised the project for complying with
// another of its own specs — and `maturity:check` is non-blocking in CI
// (S12-SR-12), so nothing failed. This test is the mechanical guard.
import * as assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const scorer = read('scripts/maturity-score.mjs');

/** Every `exists('…')` / `readJson('…')` / `read('…')` path the scorer probes. */
function probedPaths(): string[] {
  const paths = new Set<string>();
  for (const m of scorer.matchAll(/\b(?:exists|readJson|read)\(\s*'([^']+)'\s*\)/g)) {
    paths.add(m[1]);
  }
  return [...paths];
}

suite('S12 — maturity scorer detection predicates', () => {
  test('[S12-SR-15] every path a check probes exists in the repository', () => {
    const missing = probedPaths().filter((p) => !existsSync(resolve(ROOT, p)));
    assert.deepEqual(
      missing,
      [],
      `the scorer probes paths that no longer exist, so their checks score a silent 0:\n  ${missing.join('\n  ')}`,
    );
  });

  test('[S12-SR-15] the agent-hook checks point at the ported .mjs hooks', () => {
    // The specific regression this requirement was written for: S15 forbids
    // shell in the mandatory tooling, so these can never be .sh again.
    for (const hook of [
      'spec-context',
      'pre-commit-gate',
      'check-coverage',
      'session-bootstrap',
    ]) {
      assert.ok(
        scorer.includes(`.claude/hooks/${hook}.mjs`),
        `the ${hook} check must look for the .mjs hook`,
      );
      assert.ok(
        !scorer.includes(`.claude/hooks/${hook}.sh`),
        `the ${hook} check must not look for a .sh hook (S15 forbids shell here)`,
      );
    }
  });

  test('[S12-SR-16] a moved score warns; a broken scorer fails', () => {
    const block = scorer.slice(scorer.indexOf("process.argv.includes('--check')"));
    // Breakage exits non-zero: unreadable artifact, or a predicate that has
    // stopped resolving (the silent-zero condition S12-SR-15 describes).
    assert.match(block, /missing or unreadable[\s\S]*?process\.exit\(1\)/);
    assert.match(block, /unresolvablePredicatePaths\(\)/);
    assert.match(block, /score a silent 0[\s\S]*?process\.exit\(1\)/);
    // Drift warns and falls through — no exit between the warning and the end.
    const drift = block.slice(block.indexOf('const stale ='));
    assert.match(drift, /out of date/);
    assert.ok(
      !/process\.exit\(1\)/.test(drift),
      'a score that merely moved must not fail the build',
    );
  });

  test('[S12-SR-16] the CI step is blocking, not continue-on-error', () => {
    const ci = read('.github/workflows/ci.yml');
    const step = ci.slice(ci.indexOf('Maturity scorer is healthy'), ci.indexOf('Audit dependencies'));
    assert.match(step, /npm run maturity:check/);
    // Comments are not configuration: the step's own comment says what it used
    // to be, and matching that text would be a false positive.
    const directives = step
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    assert.ok(
      !/continue-on-error:\s*true/.test(directives),
      'the maturity step must block on breakage — swallowing it is what hid the stale predicates',
    );
  });

  test('[S12-SR-15] the verify-gate check follows the npm script to the runner', () => {
    // `scripts.verify` is `node scripts/verify.mjs`, so matching the npm
    // script text alone finds nothing — the check has to open the runner.
    const pkg = JSON.parse(read('package.json'));
    assert.ok(
      !/check:traceability/.test(pkg.scripts.verify),
      'precondition: the gate lives in the runner, not the npm script',
    );
    // The runner it resolves to really does run the checker...
    const runner = /node\s+(\S+\.mjs)/.exec(pkg.scripts.verify)?.[1];
    assert.ok(runner, 'verify must delegate to a Node runner');
    assert.match(read(runner as string), /check:traceability/);
    // ...and the scorer credits it, rather than scoring 0 for a gate that runs.
    const check = scorer.slice(
      scorer.indexOf("id: 'verify-runs-traceability'"),
      scorer.indexOf("id: 'constitution-present'"),
    );
    assert.match(check, /exists\(runner\)/, 'the check must open the runner it resolves');
    const score = JSON.parse(read('maturity-score.json'));
    const earned = score.dimensions
      .flatMap((d: { checks?: { id: string; points: number; earned: number }[] }) => d.checks ?? [])
      .find((c: { id: string }) => c.id === 'verify-runs-traceability');
    assert.equal(earned.earned, earned.points, 'the gate runs, so the check must earn full points');
  });
});
