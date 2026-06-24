import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile } from './helpers/ui';

test('demo-visual-editor: open the visual form editor for a schema', () =>
  runDemo('visual-editor', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'person.schema.json');
    await capture('schema-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Edit (visual)', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(4_000);
    await capture('visual-editor-open');

    await window.waitForTimeout(800);
    await capture('visual-editor-open-hold');
  }));
