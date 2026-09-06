import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile, seedGitBaseline } from './helpers/launch';
import { runCommand } from './helpers/ui';

// The committed version. The demo edits it on camera into something that
// breaks compatibility — a widened `required` and a narrowed `enum` — so the
// diff has a real verdict to report rather than a list of cosmetic moves.
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

test('demo-schema-diff: compare a schema against its last committed version', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORDER_SCHEMA);
  // "Git HEAD" is the one baseline option that needs no native dialog, and it
  // only appears when the folder is a repository with this file committed.
  seedGitBaseline();

  return runDemo('schema-diff', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    // Make `status` required — a breaking change for every existing document
    // that omits it.
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('5', { delay: 40 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('Home');
    await window.keyboard.press('Shift+End');
    await window.keyboard.type('  "required": ["id", "status"],', { delay: 55 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(1_000);
    await capture('edited');

    await runCommand(window, 'JSON Schema: Diff Against Baseline');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(800);
    await capture('baseline-picker');

    // "Git HEAD" is first in the list when a committed version exists.
    await window.waitForSelector(
      '.quick-input-list .monaco-list-row:has-text("Git HEAD")',
      { state: 'visible', timeout: 10_000 },
    );
    await window.keyboard.press('Enter');

    await window.waitForTimeout(2_500);
    await capture('diff-report');

    await window.waitForTimeout(1_200);
    await capture('diff-report-hold');
  }, true, [SCHEMA_REL_PATH]);
});
