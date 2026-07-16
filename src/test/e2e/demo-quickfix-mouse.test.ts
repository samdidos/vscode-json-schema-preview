import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, clickEditorAction, clickSelector } from './helpers/mouse';

// A closed schema with an enum + a forbidden extra property, and a data file
// that violates both — so validation surfaces two mechanically-fixable errors
// (F21): a bad enum value and an unexpected property. The data file binds to the
// schema via an inline relative `$schema` (resolved from the workspace root).
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

const DATA_REL_PATH = 'data/purchase.json';

/**
 * Mouse-driven demo of F21 validation quick fixes: validate an invalid data
 * file, then click the lightbulb on the bad enum value and pick the allowed
 * value to repair the document live. Falls back to the Ctrl+. quick-fix
 * shortcut if the lightbulb icon's DOM shape has shifted across VS Code
 * releases (same defensive pattern as demo-schema-linting-mouse).
 *
 * The data file opens via VS Code's own launch args (see runDemo's
 * `openFiles`) rather than driving Quick Open (Ctrl+P): this file was one of
 * two demos whose Quick Open row-wait reproducibly timed out on real CI
 * runs, on independent runner VMs — a real, repeatable issue with Quick
 * Open's async file-search for this fixture, not environmental flakiness.
 * This doesn't lose any mouse-specific GIF content: opening was already
 * keyboard-driven (Ctrl+P + typing) in this variant too — the mouse-driven
 * moments are the lightbulb/menu clicks below, which are unaffected.
 */
test('demo-quickfix-mouse: apply a validation quick fix from the lightbulb', () => {
  seedWorkspaceFile('schemas/order.schema.json', ORDER_SCHEMA);
  seedWorkspaceFile(DATA_REL_PATH, ORDER_DATA);

  return runDemo('quick-fix-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('workspace');

    // Validate via the editor-title icon (shown for non-schema data files);
    // this sets the diagnostics and records the quick fixes.
    await clickEditorAction(window, capture, 'JSON Schema: Validate This File', 'validate-icon');
    await window.waitForTimeout(3_000);
    await capture('validation-errors');

    // Put the cursor on the invalid enum value and open the quick-fix menu.
    await clickSelector(window, capture, '.view-line:has-text("payed")', 'error-line');
    try {
      await clickSelector(
        window,
        capture,
        '.monaco-editor .codicon-lightbulb, .monaco-editor .codicon-lightbulb-autofix',
        'lightbulb',
      );
    } catch {
      await window.keyboard.press('Control+.');
    }

    await window.waitForSelector('.action-widget .monaco-list-row', { state: 'visible', timeout: 10_000 });
    await capture('quick-fix-menu');

    // Pick "Change to \"paid\"" — the only offered value containing "paid".
    await clickSelector(window, capture, '.action-widget .monaco-list-row:has-text("paid")', 'apply-fix');
    await window.waitForTimeout(1_500);
    await capture('fixed');

    await window.waitForTimeout(800);
    await capture('fixed-hold');
  }, true, [DATA_REL_PATH]);
});
