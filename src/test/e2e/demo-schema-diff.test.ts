import { test } from '@playwright/test';
import path from 'path';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { runCommand } from './helpers/ui';

// Two versions of the same schema. v2 tightens `required` and drops an enum
// member — both breaking for documents that already exist, which is what makes
// the report worth reading.
const ORDER_V1 = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "integer" },
    "status": { "enum": ["open", "paid", "shipped", "refunded"] },
    "note": { "type": "string" }
  }
}
`;

const ORDER_V2 = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["id", "status"],
  "properties": {
    "id": { "type": "integer" },
    "status": { "enum": ["open", "paid", "shipped"] },
    "note": { "type": "string" }
  }
}
`;

const SCHEMA_REL_PATH = 'schemas/order.schema.json';
const BASELINE_REL_PATH = 'schemas/order.v1.schema.json';

/**
 * Diffs against a **workspace file**, not Git HEAD.
 *
 * The first cut used the "Git HEAD" baseline and failed in CI: the row never
 * appears, because the demo harness launches with `--disable-extensions`, which
 * takes VS Code's *built-in* extensions down too — `vscode.git` among them — so
 * the command finds no git API and offers only the other two baselines. That is
 * a property of the harness, not of the feature.
 *
 * Picking a file needs a native open dialog, which is stubbed in the main
 * process before the command runs — the same technique demo-showcase-mouse uses
 * for its save dialog, and the reason `runDemo` hands the body its
 * `ElectronApplication`. Nothing appears on screen but the report.
 */
test('demo-schema-diff: compare a schema against a previous version', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORDER_V2);
  seedWorkspaceFile(BASELINE_REL_PATH, ORDER_V1);

  return runDemo('schema-diff', async (window, capture, { app, workspaceDir }) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    await app.evaluate(({ dialog }, baselinePath) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: false, filePaths: [baselinePath] })) as typeof dialog.showOpenDialog;
    }, path.join(workspaceDir, BASELINE_REL_PATH));

    await runCommand(window, 'JSON Schema: Diff Against Baseline');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(800);
    await capture('baseline-picker');

    await window.waitForSelector(
      '.quick-input-list .monaco-list-row:has-text("Workspace file")',
      { state: 'visible', timeout: 10_000 },
    );
    await window.keyboard.press('Enter');

    await window.waitForTimeout(3_000);
    await capture('diff-report');

    await window.waitForTimeout(1_200);
    await capture('diff-report-hold');
  }, true, [SCHEMA_REL_PATH]);
});
