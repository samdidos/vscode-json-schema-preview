import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { openFile } from './helpers/ui';

const INCOMPLETE_SCHEMA = `{
  "title": "Incomplete",
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  }
}
`;

/**
 * F17 — schema linting quick fix. A schema file missing "$schema" gets a
 * lint diagnostic on its opening line; Ctrl+. opens the quick-fix menu, and
 * picking "Insert $schema declaration…" plus a draft from the follow-up
 * picker fixes it.
 */
test('demo-schema-linting: quick-fix inserts a missing $schema declaration', () => {
  seedWorkspaceFile('schemas/incomplete.schema.json', INCOMPLETE_SCHEMA);

  return runDemo('schema-linting', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'incomplete.schema.json');
    await capture('schema-file-open');

    // Lint runs on a 400ms debounce; give it room to settle, then place the
    // cursor on the opening line where the diagnostic is anchored.
    await window.waitForTimeout(800);
    await window.keyboard.press('Control+Home');
    await capture('diagnostic-shown');

    await window.keyboard.press('Control+.');
    await window.waitForSelector('.action-widget, .monaco-menu', { state: 'visible', timeout: 10_000 });
    await capture('quick-fix-menu');

    // "Insert $schema declaration…" is the top (and only) available fix.
    await window.keyboard.press('Enter');

    // Draft picker — 2020-12 is the first/default item; accept it.
    await window.waitForTimeout(800);
    await capture('draft-picker');
    await window.keyboard.press('Enter');

    await window.waitForTimeout(1_500);
    await capture('schema-declaration-inserted');

    await window.waitForTimeout(800);
    await capture('schema-declaration-inserted-hold');
  });
});
