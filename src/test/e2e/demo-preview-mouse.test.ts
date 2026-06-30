import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickEditorAction } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-preview: instead of the command palette, the preview
 * is launched by clicking the Preview icon in the editor title bar.
 */
test('demo-preview-mouse: click the editor-title Preview icon to open the preview', () =>
  runDemo('preview-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person.schema.json');

    // Click the clickable Preview icon at the top-right of the editor.
    await clickEditorAction(window, capture, 'JSON Schema: Preview', 'preview-icon');
    await window.waitForTimeout(4_500);
    await capture('preview-open');

    // The preview injects a Download button in the bottom-right corner.
    await window.waitForTimeout(800);
    await capture('preview-with-download-button');

    await window.waitForTimeout(800);
    await capture('preview-hold');
  }));
