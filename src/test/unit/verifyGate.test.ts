// S17 — concurrent verify gate orchestrator. Tests the pure summary-rendering
// logic directly (dynamic import: scripts/verify.mjs is genuine ESM); the
// actual concurrent spawning is exercised by running `npm run verify` itself,
// not re-tested here.
import * as assert from 'assert';

interface StepResult {
  name: string;
  code: number | null;
  cancelled: boolean;
  output: string;
  durationMs: number;
}
interface VerifyModule {
  STEPS: string[];
  formatDuration(ms: number): string;
  renderSummary(results: StepResult[]): string;
}
const loadVerify = async (): Promise<VerifyModule> => import('../../../scripts/verify.mjs');

suite('S17 — concurrent verify gate', () => {
  test('[S17-SR-05] declares the full step list including the audit', async () => {
    const { STEPS } = await loadVerify();
    assert.ok(STEPS.includes('check:audit'));
    assert.ok(STEPS.includes('test:coverage'));
    assert.ok(STEPS.includes('lint'));
  });

  test('[S17-SR-02] renderSummary reports every step, passing and failing alike', async () => {
    const { renderSummary } = await loadVerify();
    const out = renderSummary([
      { name: 'lint', code: 1, cancelled: false, output: 'lint blew up', durationMs: 1200 },
      { name: 'check:traceability', code: 0, cancelled: false, output: '', durationMs: 400 },
    ]);
    assert.match(out, /lint\s+.*FAIL/);
    assert.match(out, /check:traceability\s+.*pass/);
    assert.match(out, /lint blew up/);
    assert.match(out, /1\/2 step\(s\) failed/);
  });

  test('[S17-SR-04] renderSummary marks a cancelled step distinctly from a failure', async () => {
    const { renderSummary } = await loadVerify();
    const out = renderSummary([
      { name: 'lint', code: 1, cancelled: false, output: 'boom', durationMs: 100 },
      { name: 'test:coverage', code: null, cancelled: true, output: '', durationMs: 50 },
    ]);
    assert.match(out, /test:coverage\s+.*cancelled/);
    // A cancelled step's (empty) output must not be dumped as a failure detail.
    assert.doesNotMatch(out, /── test:coverage output/);
  });

  test('[S17-SR-02] renderSummary reports a clean pass when every step succeeds', async () => {
    const { renderSummary } = await loadVerify();
    const out = renderSummary([
      { name: 'lint', code: 0, cancelled: false, output: '', durationMs: 100 },
    ]);
    assert.match(out, /All 1 steps passed/);
  });
});
