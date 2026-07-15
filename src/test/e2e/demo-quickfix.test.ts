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

    // Running the command via the Command Palette can leave keyboard focus
    // somewhere other than the editor (a notification, the palette's prior
    // target) — reclaim it deterministically by clicking the file's own tab
    // (a small, reliably-rendered element, unlike the full content pane) —
    // then position the cursor with pure keyboard navigation. No DOM
    // text-matching against Monaco's rendered spans and no Find widget,
    // mirroring demo-schema-linting.test.ts's proven Ctrl+Home-based pattern:
    // the file's fixed, test-authored content makes the target line's
    // position exactly known (line 3, "status": "payed").
    await window.click(`.tab[aria-label*="purchase.json"]`);
    await window.keyboard.press('Control+Home');
    await window.keyboard.press('ArrowDown'); // line 2: $schema
    await window.keyboard.press('ArrowDown'); // line 3: "status": "payed"
    for (let i = 0; i < 5; i++) { await window.keyboard.press('ArrowRight'); } // inside "status"
    await capture('cursor-positioned');

    await window.keyboard.press('Control+.');
    await window.waitForSelector('.action-widget .monaco-list-row', { state: 'visible', timeout: 10_000 });
    await capture('quick-fix-menu');

    await window.keyboard.press('Enter'); // apply the first offered fix
    await window.waitForTimeout(1_500);
    await capture('fixed');
  });
});
