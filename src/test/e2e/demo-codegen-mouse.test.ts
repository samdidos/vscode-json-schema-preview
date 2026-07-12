import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickEditorOverflowAction, clickSelector } from './helpers/mouse';

/**
 * Mouse-flavoured twin of demo-codegen — the frames this one captures are what
 * `scripts/make-gifs.mjs` turns into `demo-codegen.gif`.
 *
 * Unlike the validate/infer mouse demos, Generate Types is NOT triggered from
 * an editor-title icon: its action lives in the `1_run` overflow group (the
 * "⋯" More Actions menu), not the always-visible navigation group. This demo
 * clicks the "⋯" button and picks the entry from the dropdown, then clicks the
 * first row in each follow-up quick-pick (language, destination) instead of
 * blindly pressing Enter — so the whole flow stays mouse-driven.
 */
test('demo-codegen-mouse: generate TypeScript types from a schema', () =>
  runDemo('codegen-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person.schema.json');

    await clickEditorOverflowAction(
      window,
      capture,
      'Generate Types from This Schema',
      'generate-types',
    );

    // Target-language picker — TypeScript is the first/default item; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('language-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'language-pick');

    // Destination picker — "Open in a new editor" is the default; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('destination-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'destination-pick');

    await window.waitForTimeout(5_000);
    await capture('generated-types');

    await window.waitForTimeout(800);
    await capture('generated-types-hold');
  }));
