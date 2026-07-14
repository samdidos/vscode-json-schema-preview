import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { openFile, runCommand } from './helpers/ui';

// Same fixture as the mouse twin: a closed schema (enum + no additional
// properties) and a data file that violates both, bound via inline `$schema`.
const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["status", "total"],
  "properties": {
    "status": { "enum": ["open", "paid", "shipped"] },
    "total": { "type": "integer" }
  },
  "additionalProperties": false
}
`;

const ORDER_DATA = `{
  "$schema": "./schemas/order.schema.json",
  "status": "payed",
  "total": 42,
  "notes": "rush"
}
`;

/**
 * Command-palette twin of demo-quickfix-mouse (no animated cursor). Runs the
 * validate command, then opens the quick-fix menu with Ctrl+. and applies a fix.
 * This variant is the CI UI-smoke signal (S08-SR-10); its frames are not used
 * for GIFs.
 */
test('demo-quickfix: apply a validation quick fix from the diagnostics', () => {
  seedWorkspaceFile('schemas/order.schema.json', ORDER_SCHEMA);
  seedWorkspaceFile('data/order.json', ORDER_DATA);

  return runDemo('quick-fix', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'order.json');
    await capture('data-open');

    await runCommand(window, 'JSON Schema: Validate This File');
    await window.waitForTimeout(2_000);
    await capture('validation-errors');

    // Position the cursor on the invalid enum value and open quick fixes.
    await window.click('.view-line:has-text("payed")');
    await window.keyboard.press('Control+.');
    await window.waitForSelector('.action-widget .monaco-list-row', { state: 'visible', timeout: 10_000 });
    await capture('quick-fix-menu');

    await window.keyboard.press('Enter'); // apply the first offered fix
    await window.waitForTimeout(1_500);
    await capture('fixed');
  });
});
