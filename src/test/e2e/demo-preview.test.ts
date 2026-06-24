import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile } from './helpers/ui';

test('demo-preview: open schema and show preview panel with download button', () =>
  runDemo('preview', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'person.schema.json');
    await capture('schema-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Preview', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(4_500);
    await capture('preview-open');

    // The preview injects a Download button in the bottom-right corner
    await window.waitForTimeout(800);
    await capture('preview-with-download-button');

    // Hold on the final frame for the GIF loop
    await window.waitForTimeout(800);
    await capture('preview-hold');
  }));
