import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickEditorAction } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-validation: the validate action is triggered from
 * the editor-title icon ($(pass)) shown for non-schema JSON files.
 */
test('demo-validation-mouse: click the editor-title Validate icon on an invalid file', () =>
  runDemo('validation-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person-invalid.json');

    await clickEditorAction(window, capture, 'JSON Schema: Validate This File', 'validate-icon');
    await window.waitForTimeout(5_000);
    await capture('validation-result');

    await window.waitForTimeout(800);
    await capture('validation-result-hold');
  }));
