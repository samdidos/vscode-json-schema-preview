import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { openFile, runCommand } from './helpers/ui';

// A closed schema (enum + no additional properties) and a data file that
// violates both. The data file's basename ("purchase.json") deliberately
// shares no characters-in-order with the schema's ("order.schema.json") so
// Quick Open's fuzzy filter can never treat them as ambiguous candidates.
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
  seedWorkspaceFile('data/purchase.json', ORDER_DATA);

  return runDemo('quick-fix', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'purchase.json');
    await capture('data-open');

    await runCommand(window, 'JSON Schema: Validate This File');
    await window.waitForTimeout(3_000);
    await capture('validation-errors');

    // Position the cursor on the invalid enum value with Find (Ctrl+F) rather
    // than clicking a specific DOM text run inside Monaco's rendered spans —
    // entirely keyboard-driven, fitting this command-palette (no mouse)
    // variant, and far more robust than a text-content selector click.
    await window.keyboard.press('Control+f');
    await window.waitForSelector('.find-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.type('payed', { delay: 40 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Escape'); // close Find; cursor stays at the match
    await window.waitForTimeout(300);

    await window.keyboard.press('Control+.');
    await window.waitForSelector('.action-widget .monaco-list-row', { state: 'visible', timeout: 10_000 });
    await capture('quick-fix-menu');

    await window.keyboard.press('Enter'); // apply the first offered fix
    await window.waitForTimeout(1_500);
    await capture('fixed');
  });
});
