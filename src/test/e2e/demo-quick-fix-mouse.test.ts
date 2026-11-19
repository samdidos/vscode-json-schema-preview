import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, clickEditorAction, clickSelector } from './helpers/mouse';

// A closed schema with an enum and a forbidden extra property, and a YAML data
// file with two typos — a misspelt enum value (`shiped`) and a misspelt
// property name (`nots`). Both are clear near-misses (F25), so the lightbulb
// offers "Fix all 2 auto-fixable validation problems" (F21-FR-13), which
// changes the value and renames the key at once in YAML syntax (F21-FR-10). The data file binds to the schema via an inline
// relative `$schema` key (resolved from the workspace root). The schema's
// `$schema` property is optional: the binding key is exempt from
// additionalProperties anyway (F03-FR-18).
const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["status", "total"],
  "properties": {
    "$schema": { "type": "string" },
    "status": { "enum": ["open", "paid", "shipped"] },
    "total": { "type": "integer" },
    "notes": { "type": "string" }
  },
  "additionalProperties": false
}
`;

const ORDER_DATA = `$schema: ./schemas/order.schema.json
status: shiped
total: 42
nots: rush
`;

const DATA_REL_PATH = 'data/purchase.yaml';

/**
 * Mouse-driven demo of F21/F25 validation quick fixes in a YAML file: validate
 * an invalid data file, click the lightbulb on the misspelt enum value, show
 * the menu (closest value first, then "Fix all"), then apply "Fix all" to
 * repair both typos live — the value and the misspelt property name. Falls back to the Ctrl+. quick-fix
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
test('demo-quick-fix-mouse: apply a validation quick fix from the lightbulb', () => {
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

    // Put the cursor on the misspelt enum value and open the quick-fix menu.
    // (Not the misspelt key: an additionalProperties error is reported at its
    // parent object, so the `nots` line itself carries no diagnostic. "Fix all"
    // is offered from any validation diagnostic and repairs both typos.)
    await clickSelector(window, capture, '.view-line:has-text("shiped")', 'error-line');
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

    // The menu leads with the closest enum value; pick "Fix all" to repair the
    // enum value and rename the property in one edit.
    await clickSelector(window, capture, '.action-widget .monaco-list-row:has-text("Fix all")', 'apply-fix');
    await window.waitForTimeout(1_500);
    await capture('fixed');

    // Validate again so the demo ends on a clean file, not on the previous
    // run's now-stale squiggles (S08-SR-19).
    await clickEditorAction(window, capture, 'JSON Schema: Validate This File', 'revalidate-icon');
    await window.waitForTimeout(2_000);
    await capture('valid');

    await window.waitForTimeout(800);
    await capture('valid-hold');
  }, true, [DATA_REL_PATH]);
});
