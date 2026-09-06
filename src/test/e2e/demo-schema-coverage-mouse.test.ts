import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, clickEditorAction, clickSelector } from './helpers/mouse';

// Same fixture as demo-schema-coverage — see that file for why the data is
// deliberately sparse.
const SPARSE_DATA = `{
  "$schema": "../schemas/person.schema.json",
  "id": 7,
  "name": "Bob Baker",
  "email": "bob@example.com"
}
`;

const DATA_REL_PATH = 'data/person-sparse.json';

/**
 * Mouse-driven twin of demo-schema-coverage. Coverage has its own toolbar icon
 * on a *data* file (`navigation@6`), so this is one of the demos that never
 * needs the palette at all — click the icon, read the report, then click
 * through to the schema to see which properties were flagged.
 */
test('demo-schema-coverage-mouse: measure coverage from the toolbar and read the flagged properties', () => {
  seedWorkspaceFile(DATA_REL_PATH, SPARSE_DATA);

  return runDemo('schema-coverage-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('workspace');

    await clickEditorAction(window, capture, 'Report Schema Coverage', 'coverage-icon');
    await window
      .waitForSelector('.notification-list-item', { state: 'visible', timeout: 20_000 })
      .catch(() => undefined);
    await window.waitForTimeout(1_500);
    await capture('coverage-report');

    // The unexercised properties are reported as hints on the schema file, so
    // the Problems panel is where the actual list lives.
    await window.keyboard.press('Control+Shift+m');
    await window.waitForTimeout(1_200);
    await capture('problems-panel');

    // Click one flagged property to land the editor on it in the schema.
    await clickSelector(
      window,
      capture,
      '.markers-panel .monaco-list-row, .monaco-list-row:has-text("never")',
      'flagged-property',
    ).catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('located');

    await window.waitForTimeout(900);
    await capture('located-hold');
  }, true, [DATA_REL_PATH]);
});
