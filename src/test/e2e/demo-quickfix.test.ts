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

    // Land the cursor exactly on a validation diagnostic. Running Validate via
    // the Command Palette can leave focus off the editor, so click into the
    // editor content to focus it, then press F8 (Go to Next Problem) — this
    // jumps the cursor precisely onto the first marker no matter where it sits,
    // far more robust than counting lines/columns or matching Monaco's rendered
    // text spans.
    await window.click('.monaco-editor .view-lines');
    await window.keyboard.press('F8');
    await window.waitForTimeout(500);
    await capture('cursor-positioned');

    await window.keyboard.press('Control+.');
    await window.waitForSelector('.action-widget .monaco-list-row', { state: 'visible', timeout: 10_000 });
    await capture('quick-fix-menu');

    await window.keyboard.press('Enter'); // apply the first offered fix
    await window.waitForTimeout(1_500);
    await capture('fixed');
  });
});
