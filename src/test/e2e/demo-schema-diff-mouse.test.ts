import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile, seedGitBaseline } from './helpers/launch';
import { installCursor, clickEditorOverflowAction, clickSelector, typeSlowly } from './helpers/mouse';

// Same fixture as demo-schema-diff — see that file for why the edit is
// deliberately breaking.
const ORDER_SCHEMA = `{
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

const SCHEMA_REL_PATH = 'schemas/order.schema.json';

/**
 * Mouse-driven twin of demo-schema-diff. Types the breaking edit on camera,
 * then reaches Diff Against Baseline through the editor toolbar — the diff is
 * only interesting once there is a change to diff, so the edit has to be part
 * of the recording rather than seeded.
 */
test('demo-schema-diff-mouse: break compatibility, then diff against Git HEAD', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORDER_SCHEMA);
  seedGitBaseline();

  return runDemo('schema-diff-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    // Click into the `required` line and widen it — every document without a
    // `status` stops validating.
    await clickSelector(window, capture, '.view-line:has-text("required")', 'click-required');
    await window.keyboard.press('Home');
    await window.keyboard.press('Shift+End');
    await window.waitForTimeout(300);
    await typeSlowly(window, capture, '  "required": ["id", "status"],', 'edit-required', 55);
    await window.waitForTimeout(400);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(1_000);
    await capture('edited');

    await clickEditorOverflowAction(window, capture, 'Diff Against Baseline', 'diff');

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(700);
    await capture('baseline-picker');

    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("Git HEAD")',
      'pick-git-head',
    );

    await window.waitForTimeout(2_500);
    await capture('diff-report');

    await window.waitForTimeout(1_200);
    await capture('diff-report-hold');
  }, true, [SCHEMA_REL_PATH]);
});
