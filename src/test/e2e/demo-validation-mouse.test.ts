import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, openFileVisible, clickEditorAction } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-validation: the validate action is triggered from
 * the editor-title icon ($(pass)) shown for non-schema JSON files.
 *
 * The binding is seeded (S08-SR-19). `showcase/data/person-invalid.json` ships
 * deliberately unbound — demo-showcase binds it on camera, which is the point
 * of that narrative — so without this the demo ended on "No schema bound to
 * person-invalid.json. Bind one first." and never validated anything. Binding
 * it here at WorkspaceFolder scope, the way demo-workspace-validation does,
 * lets the one demo of the extension's headline feature actually show it.
 */
test('demo-validation-mouse: click the editor-title Validate icon on an invalid file', () => {
  seedWorkspaceFile(
    '.vscode/settings.json',
    JSON.stringify(
      {
        'json.schemas': [
          { url: './schemas/person.schema.json', fileMatch: ['data/person-invalid.json'] },
        ],
      },
      null,
      2,
    ),
  );

  return runDemo('validation-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person-invalid.json');

    await clickEditorAction(window, capture, 'JSON Schema: Validate This File', 'validate-icon');
    // The error notification and the squiggles land together; wait for the
    // notification so the frame that gets captured is the result, not the
    // moment before it.
    await window
      .waitForSelector('.notification-list-item', { state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('validation-result');

    // Show where the errors landed: the Problems panel lists every violation
    // with its location, which the squiggles alone do not convey in a still.
    await window.keyboard.press('Control+Shift+m');
    await window
      .waitForSelector('.markers-panel, .panel .markers-panel-container', {
        state: 'visible',
        timeout: 10_000,
      })
      .catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('problems-panel');

    await window.waitForTimeout(800);
    await capture('problems-panel-hold');
  });
});
