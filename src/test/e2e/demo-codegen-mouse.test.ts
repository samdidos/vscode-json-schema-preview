import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible } from './helpers/mouse';

/**
 * Mouse-flavoured twin of demo-codegen — the frames this one captures are what
 * `scripts/make-gifs.mjs` turns into `demo-codegen.gif`.
 *
 * Unlike the validate/infer mouse demos, Generate Types is NOT triggered from
 * an editor-title icon: its action lives in the `1_run` overflow group (the
 * "⋯" More Actions menu), not the always-visible navigation group, so clicking
 * it directly is unreliable. This demo therefore drives the command from the
 * Command Palette, which is deterministic regardless of overflow, while still
 * showing the animated cursor and character-by-character typing for continuity
 * with the other demo GIFs.
 */
test('demo-codegen-mouse: generate TypeScript types from a schema', () =>
  runDemo('codegen-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person.schema.json');

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
