import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile } from './helpers/ui';

/**
 * F16 — Generate a valid sample instance from a schema. Opens a schema file,
 * runs the command from the palette, accepts the JSON format in the picker,
 * and shows the generated instance opening beside the schema.
 */
test('demo-sample-data: generate a valid sample instance from a schema', () =>
  runDemo('sample-data', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'person.schema.json');
    await capture('schema-file-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Generate Sample Data from This Schema', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    // Format picker — JSON is the first/default item; accept it.
    await window.waitForTimeout(800);
    await capture('format-picker');
    await window.keyboard.press('Enter');

    await window.waitForTimeout(3_000);
    await capture('generated-sample');

    await window.waitForTimeout(800);
    await capture('generated-sample-hold');
  }));
