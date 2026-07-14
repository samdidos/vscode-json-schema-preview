// S03-SR-13 / S08-SR-07 — measure preview-generation latency in the E2E
// harness and assert the 2 s p95 budget (S03-SR-13), promoting both
// requirements from `planned` with a real measurement instead of a guess.
//
// Measured against the built-in, dependency-free renderer (F01-FR-27) rather
// than the optional Python/json_schema_for_humans path: that path has its
// own already-specified budget (S03-SR-11's 30 s subprocess timeout) and,
// on a machine without the package pre-installed, would `pip install` it —
// hitting the network, which S08-NFR-02 rules out for this suite, and making
// the measurement dependent on interpreter/package availability rather than
// this extension's own code. The built-in renderer is the one path this
// suite can always exercise deterministically and offline, so S03-SR-13 is
// measured against it here.
//
// `openJsonSchema` is called directly (bypassing the `jsonschema.preview`
// command) because the command's handler fires it without awaiting
// (`PreviewWebPanel.ts`'s `previewJsonSchema`) so timing the command
// dispatch itself would only measure microtask overhead, not generation.
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { closeAllEditors, FIXTURES_ROOT } from '../helpers';
import { openJsonSchema, openJsonSchemaFiles } from '../../../PreviewWebPanel';

const FIXTURE = path.join(FIXTURES_ROOT, 'single-folder');
const SCHEMA_URI = vscode.Uri.file(path.join(FIXTURE, 'schema.json'));
const SAMPLES = 20;
const P95_BUDGET_MS = 2000;

function p95(sortedAscending: number[]): number {
  const idx = Math.max(0, Math.ceil(0.95 * sortedAscending.length) - 1);
  return sortedAscending[idx];
}

suite('[S03-SR-13][S08-SR-07] Preview-generation p95 latency budget', () => {
  setup(async () => {
    await vscode.workspace.getConfiguration('jsonschema.preview')
      .update('renderer', 'builtin', vscode.ConfigurationTarget.Workspace);
    await closeAllEditors();
  });
  teardown(async () => {
    Object.values(openJsonSchemaFiles).forEach(panel => panel.dispose());
    await vscode.workspace.getConfiguration('jsonschema.preview')
      .update('renderer', undefined, vscode.ConfigurationTarget.Workspace);
    await closeAllEditors();
  });

  test(`[S03-SR-13][S08-SR-07] p95 over ${SAMPLES} runs of the fixture schema stays within the 2s budget`, async function () {
    this.timeout(60_000);
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const durations: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      const start = Date.now();
      await openJsonSchema(context, SCHEMA_URI, true);
      durations.push(Date.now() - start);
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const measuredP95 = p95(sorted);
    // Surfaced in CI logs so the budget's real headroom is visible even when
    // the assertion passes, per S08-SR-07 ("measured ... and reported").
    console.log(`[S03-SR-13] preview generation p95 over ${SAMPLES} runs: ${measuredP95}ms (samples: ${sorted.join(', ')}ms)`);

    assert.ok(
      measuredP95 <= P95_BUDGET_MS,
      `expected p95 preview-generation latency <= ${P95_BUDGET_MS}ms, measured ${measuredP95}ms over ${SAMPLES} runs: ${sorted.join(', ')}ms`
    );
  });
});
