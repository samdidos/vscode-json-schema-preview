import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile } from './helpers/ui';

test('demo-validation: validate an invalid JSON file against its schema', () =>
  runDemo('validation', async (window, capture) => {
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
  }));
