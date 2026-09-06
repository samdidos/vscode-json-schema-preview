import { test } from '@playwright/test';
import path from 'path';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, clickEditorOverflowAction, clickSelector } from './helpers/mouse';

// Same fixtures as demo-schema-diff — see that file for why the baseline is a
// workspace file rather than Git HEAD.
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
 * Mouse-driven twin of demo-schema-diff: reach the command through the editor
 * toolbar's grouped menu, pick the baseline, read the verdict.
 *
 * The native open dialog is stubbed in the main process, so choosing the
 * baseline file shows as a single click on "Workspace file…" and no OS chrome
 * ever enters the frame.
 */
test('demo-schema-diff-mouse: diff a schema against its previous version', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORDER_V2);
  seedWorkspaceFile(BASELINE_REL_PATH, ORDER_V1);

  return runDemo('schema-diff-mouse', async (window, capture, { app, workspaceDir }) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    await app.evaluate(({ dialog }, baselinePath) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: false, filePaths: [baselinePath] })) as typeof dialog.showOpenDialog;
    }, path.join(workspaceDir, BASELINE_REL_PATH));

    await clickEditorOverflowAction(window, capture, 'Diff Against Baseline', 'diff');

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(700);
    await capture('baseline-picker');

    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("Workspace file")',
      'pick-baseline',
    );

    await window.waitForTimeout(3_000);
    await capture('diff-report');

    await window.waitForTimeout(1_200);
    await capture('diff-report-hold');
  }, true, [SCHEMA_REL_PATH]);
});
