import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile } from './helpers/ui';

/**
 * F31 — the schema-aware Outline, shown through Go-to-Symbol
 * (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>).
 *
 * The Outline *view* is the headline surface, and the mouse twin drives it —
 * but it is a collapsed Explorer pane whose chrome selectors have moved across
 * VS Code releases. Go-to-Symbol reads the same document-symbol provider
 * through a widget whose selector has been stable for years, which is the right
 * trade for the command-palette variant: this one exists to crash-smoke the
 * feature (S08-SR-10), not to reproduce the mouse narrative.
 *
 * `person.schema.json` ships in the showcase workspace and has nested objects,
 * an array, an enum and a $defs section — enough for the symbol list to be
 * worth looking at without seeding anything.
 */
test('demo-outline: read a schema through its document symbols', () =>
  runDemo('outline', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'person.schema.json');
    await capture('schema-open');

    await window.keyboard.press('Control+Shift+o');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(1_200);
    await capture('symbols');

    await window.waitForTimeout(1_000);
    await capture('symbols-hold');
  }));
