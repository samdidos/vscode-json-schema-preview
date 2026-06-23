import { test } from '@playwright/test';
import { launchVSCode } from './helpers/launch';
import { openFile } from './helpers/ui';
import { captureSequence } from './helpers/capture';

test('demo-inference: generate a JSON Schema from a data file', async () => {
  const { app, window } = await launchVSCode();
  const capture = captureSequence(window, 'inference');

  try {
    await capture('workspace');

    await openFile(window, 'person-valid.json');
    await capture('data-file-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Generate Schema from This File', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(5_000);
    await capture('inferred-schema');

    await window.waitForTimeout(800);
    await capture('inferred-schema-hold');
  } finally {
    await app.close();
  }
});
