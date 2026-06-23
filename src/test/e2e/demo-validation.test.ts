import { test } from '@playwright/test';
import { launchVSCode } from './helpers/launch';
import { openFile, runCommand } from './helpers/ui';
import { captureSequence } from './helpers/capture';

test('demo-validation: validate an invalid JSON file against its schema', async () => {
  const { app, window } = await launchVSCode();
  const capture = captureSequence(window, 'validation');

  try {
    await capture('workspace');

    await openFile(window, 'person-invalid.json');
    await capture('invalid-file-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Validate This File', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(5_000);
    await capture('validation-result');

    await window.waitForTimeout(800);
    await capture('validation-result-hold');
  } finally {
    await app.close();
  }
});
