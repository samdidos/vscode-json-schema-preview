import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickEditorOverflowAction, clickSelector } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-sample-data — Generate Sample Data lives in the
 * editor-title "⋯" overflow group (`1_run`), same as Generate Types, so this
 * clicks through the overflow menu and the format quick-pick instead of using
 * the Command Palette.
 */
test('demo-sample-data-mouse: generate a valid sample instance from a schema', () =>
  runDemo('sample-data-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person.schema.json');

    await clickEditorOverflowAction(
      window,
      capture,
      'Generate Sample Data from This Schema',
      'generate-sample',
    );

    // Format picker — JSON is the first item; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('format-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'format-pick');

    await window.waitForTimeout(3_000);
    await capture('generated-sample');

    await window.waitForTimeout(800);
    await capture('generated-sample-hold');
  }));
