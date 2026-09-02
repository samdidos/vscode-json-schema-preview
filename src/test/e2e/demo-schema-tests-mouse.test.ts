import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, typeSlowly, clickSelector } from './helpers/mouse';

// Same fixtures as demo-schema-tests — see that file for why the suite has a
// deliberate failing case.
const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["status", "total"],
  "properties": {
    "status": { "enum": ["open", "paid", "shipped"] },
    "total": { "type": "integer", "minimum": 0 }
  },
  "additionalProperties": false
}
`;

const ORDER_SUITE = `{
  "schema": "./order.schema.json",
  "description": "What an order document must and must not look like",
  "valid": [
    { "status": "open", "total": 0 },
    { "status": "paid", "total": 42 },
    { "name": "a refund", "instance": { "status": "refunded", "total": 7 } }
  ],
  "invalid": [
    { "name": "a total that is not a number", "instance": { "status": "open", "total": "42" }, "errors": ["type"] },
    { "name": "an unknown status", "instance": { "status": "cancelled", "total": 1 }, "errors": ["enum"] }
  ]
}
`;

const SUITE_REL_PATH = 'schemas/order.schema.test.json';

/**
 * Mouse-driven twin of demo-schema-tests. Running the suite has no toolbar
 * icon — the Command Palette is its entry point for everyone — so this types
 * the command with the animated cursor for continuity, then clicks the failing
 * case in the Problems panel to land the editor on the case that broke.
 *
 * The suite opens through VS Code's own launch args rather than Quick Open,
 * the same defensive choice demo-quickfix-mouse documents: the file is
 * freshly seeded, so its search-index visibility isn't something to depend on.
 */
test('demo-schema-tests-mouse: run a suite and click through to the failing case', () => {
  seedWorkspaceFile('schemas/order.schema.json', ORDER_SCHEMA);
  seedWorkspaceFile(SUITE_REL_PATH, ORDER_SUITE);

  return runDemo('schema-tests-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('workspace');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await capture('command-palette');

    await typeSlowly(window, capture, 'JSON Schema: Run Schema Tests', 'command-typed');
    await window.waitForTimeout(500);
    await window.keyboard.press('Enter');

    await window
      .waitForSelector('.notification-list-item', { state: 'visible', timeout: 20_000 })
      .catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('results');

    await window.keyboard.press('Control+Shift+m');
    await window.waitForTimeout(1_000);
    await capture('problems-panel');

    // Click the failing case's entry — the editor reveals the case that broke,
    // in the suite file where it was declared.
    await clickSelector(
      window,
      capture,
      '.markers-panel .monaco-list-row:has-text("refund"), .monaco-list-row:has-text("refund")',
      'failing-case',
    ).catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('located');

    await window.waitForTimeout(800);
    await capture('located-hold');
  }, true, [SUITE_REL_PATH]);
});
