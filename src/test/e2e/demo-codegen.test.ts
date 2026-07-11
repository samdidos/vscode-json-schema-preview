import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile } from './helpers/ui';

/**
 * F18 — Generate TypeScript types from a schema. Opens a bound-free schema
 * file, runs the command from the palette, accepts the TypeScript target in
 * the language picker, and shows the generated `interface` opening beside the
 * schema.
 */
test('demo-codegen: generate TypeScript types from a schema', () =>
  runDemo('codegen', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'person.schema.json');
    await capture('schema-file-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Generate Types from This Schema', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    // Target-language picker — a single "TypeScript" item today; accept it.
    await window.waitForTimeout(800);
    await capture('language-picker');
    await window.keyboard.press('Enter');

    await window.waitForTimeout(5_000);
    await capture('generated-types');

    await window.waitForTimeout(800);
    await capture('generated-types-hold');
  }));
