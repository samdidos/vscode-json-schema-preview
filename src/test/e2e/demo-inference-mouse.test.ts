import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickEditorAction } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-inference: schema generation is triggered from the
 * editor-title wand icon ($(wand)) shown for non-schema JSON files.
 */
test('demo-inference-mouse: click the editor-title Generate Schema icon', () =>
  runDemo('inference-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person-valid.json');

    await clickEditorAction(
      window,
      capture,
      'JSON Schema: Generate Schema from This File',
      'generate-icon',
    );
    await window.waitForTimeout(5_000);
    await capture('inferred-schema');

    await window.waitForTimeout(800);
    await capture('inferred-schema-hold');
  }));
