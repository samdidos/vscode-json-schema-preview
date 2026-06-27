import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile, runCommand } from './helpers/ui';
import { seedUserSettings } from './helpers/launch';

test('demo-live-update: preview refreshes as the schema is edited', () => {
  // Pre-seed liveUpdate so the demo can skip the settings-editing step and
  // go straight to demonstrating the live-refresh behaviour.
  seedUserSettings({ 'jsonschema.preview.liveUpdate': true });

  return runDemo('live-update', async (window, capture) => {
    await openFile(window, 'bookshelf.schema.yaml');
    await capture('schema-open');

    await runCommand(window, 'JSON Schema: Preview');
    await window.waitForTimeout(4_000);
    await capture('preview-open');

    // Edit the schema title to trigger a live refresh
    await openFile(window, 'bookshelf.schema.yaml');
    await window.waitForTimeout(500);

    // Use Ctrl+G to go to line 2 (title line) and edit
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('2', { delay: 30 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('End');
    await window.keyboard.type(' (Updated)', { delay: 30 });
    await capture('schema-being-edited');

    await window.keyboard.press('Control+s');
    await window.waitForTimeout(3_000); // debounce + render
    await capture('preview-live-updated');

    await window.waitForTimeout(800);
    await capture('preview-live-updated-hold');
  });
});
