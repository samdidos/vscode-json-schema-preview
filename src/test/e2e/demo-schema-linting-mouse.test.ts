import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, openFileVisible, clickSelector } from './helpers/mouse';

const INCOMPLETE_SCHEMA = `{
  "title": "Incomplete",
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  }
}
`;

/**
 * Mouse-driven twin of demo-schema-linting — a schema file missing "$schema"
 * gets a lint diagnostic on its opening line; clicking the lightbulb that
 * appears there opens the quick-fix menu, and picking "Insert $schema
 * declaration…" plus a draft from the follow-up picker fixes it live.
 *
 * The lightbulb's exact DOM shape is one of the few widgets that can shift
 * across VS Code releases, so this falls back to the Ctrl+. quick-fix
 * keyboard shortcut if the icon isn't clickable — the same defensive pattern
 * demo-workspace-trust-mouse uses for its own version-sensitive dialog.
 */
test('demo-schema-linting-mouse: click the quick-fix lightbulb to insert $schema', () => {
  seedWorkspaceFile('schemas/incomplete.schema.json', INCOMPLETE_SCHEMA);

  return runDemo('schema-linting-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'incomplete.schema.json');

    // Lint runs on a 400ms debounce; give it room to settle and place the
    // cursor on the opening line, where the require-schema-declaration
    // diagnostic (and its lightbulb) appears.
    await window.waitForTimeout(800);
    await clickSelector(window, capture, '.view-line:has-text("{")', 'diagnostic-line');
    await capture('diagnostic-shown');

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

    const quickFixSel =
      '.action-widget .monaco-list-row:has-text("Insert $schema declaration"), ' +
      '.monaco-menu .action-item .action-label:has-text("Insert $schema declaration")';
    await window.waitForSelector(quickFixSel, { state: 'visible', timeout: 10_000 });
    await capture('quick-fix-menu');
    await clickSelector(window, capture, quickFixSel, 'insert-schema-fix');

    // Draft picker — 2020-12 is the first item; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('draft-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'draft-pick');

    await window.waitForTimeout(1_500);
    await capture('schema-declaration-inserted');

    await window.waitForTimeout(800);
    await capture('schema-declaration-inserted-hold');
  });
});
