import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';

const SCHEMA_REL_PATH = 'schemas/person.schema.json';

/**
 * F34 is about discoverability rather than any one command, so this demo shows
 * the two places the extension answers "what can this thing do?": the
 * walkthrough it registers for a first-time user, and the single `JSON Schema:`
 * prefix that gathers every command in the palette.
 *
 * `person.schema.json` ships in the showcase workspace and is opened through
 * VS Code's own launch args, so the toolbar is populated behind the palette and
 * the commands on screen are ones the reader can see apply to the file in front
 * of them. It is opened that way rather than waited for: a demo that passes no
 * `openFiles` gets no editor at all, which is what broke the first run of this
 * script — a 15s wait on `.view-lines` against VS Code's empty state.
 */
test('demo-command-surface: find the extension through its walkthrough and command prefix', () =>
  runDemo('command-surface', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    // One prefix, every command.
    await window.keyboard.down('Control');
    await window.keyboard.down('Shift');
    await window.keyboard.press('p');
    await window.keyboard.up('Shift');
    await window.keyboard.up('Control');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.type('JSON Schema: ', { delay: 55 });
    await window.waitForTimeout(1_200);
    await capture('command-prefix');
    await window.waitForTimeout(1_000);
    await capture('command-prefix-hold');

    await window.keyboard.press('Escape');
    await window.waitForTimeout(400);

    // The walkthrough — what a new install offers before you know any of this.
    await window.keyboard.down('Control');
    await window.keyboard.down('Shift');
    await window.keyboard.press('p');
    await window.keyboard.up('Shift');
    await window.keyboard.up('Control');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.type('Welcome: Open Walkthrough', { delay: 40 });
    await window.waitForSelector(
      '.quick-input-list .monaco-list-row:has-text("Open Walkthrough")',
      { state: 'visible', timeout: 10_000 },
    );
    await window.keyboard.press('Enter');

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await window.waitForTimeout(800);
    await window.waitForSelector(
      '.quick-input-list .monaco-list-row:has-text("JSON Schema Preview")',
      { state: 'visible', timeout: 10_000 },
    ).catch(() => undefined);
    await capture('walkthrough-picker');
    await window.keyboard.press('Enter');

    await window.waitForTimeout(3_000);
    await capture('walkthrough');

    await window.waitForTimeout(1_500);
    await capture('walkthrough-hold');
  }, true, [SCHEMA_REL_PATH]));
