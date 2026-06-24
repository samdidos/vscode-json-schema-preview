import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile, runCommand } from './helpers/ui';

test('demo-live-update: preview refreshes as the schema is edited', () =>
  runDemo('live-update', async (window, capture) => {
    // Enable live update via settings before opening files
    await runCommand(window, 'Preferences: Open User Settings (JSON)');
    await window.waitForTimeout(1_500);
    // Move cursor to end of JSON object and insert the setting
    await window.keyboard.press('Control+End');
    await window.keyboard.press('ArrowLeft'); // before closing }
    await window.keyboard.type(',\n  "jsonschema.preview.liveUpdate": true', { delay: 20 });
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(500);

    await openFile(window, 'bookshelf.schema.yaml');
    await capture('schema-open');

    await runCommand(window, 'JSON Schema: Preview');
    await window.waitForTimeout(4_000);
    await capture('preview-open');

    // Edit the schema title to trigger a live refresh
    await openFile(window, 'bookshelf.schema.yaml');
    await window.waitForTimeout(500);

    // Find "Bookshelf" in the title line and change it
    await window.keyboard.press('Control+h');
    await window.waitForSelector('.find-widget', { state: 'visible' }).catch(() => {});
    await window.waitForTimeout(400);
    await window.keyboard.press('Escape');

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
  }));
