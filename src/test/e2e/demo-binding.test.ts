import { test } from '@playwright/test';
import { launchVSCode } from './helpers/launch';
import { openFile } from './helpers/ui';
import { captureSequence } from './helpers/capture';

test('demo-binding: bind a JSON data file to a schema and see status bar update', async () => {
  const { app, window } = await launchVSCode();
  const capture = captureSequence(window, 'binding');

  try {
    await capture('workspace');

    // Open a data file that has no inline $schema (so the status bar shows "unbound")
    await openFile(window, 'person-valid.json');
    await capture('data-file-open-unbound');

    // Open the command palette for Bind Schema
    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Bind Schema', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(2_000);
    // The schema picker (Quick Pick) lists all schemas found in the workspace
    await capture('schema-picker');

    // Select the person schema
    await window.keyboard.type('person.schema.json', { delay: 30 });
    await window.waitForTimeout(400);
    await capture('schema-picker-filtered');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(2_000);
    // Status bar now shows "$(check) Schema: person.schema.json"
    await capture('status-bar-bound');

    await window.waitForTimeout(500);
    await capture('binding-done-hold');
  } finally {
    await app.close();
  }
});
