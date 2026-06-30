import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickEditorAction } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-visual-editor: the visual form editor is opened from
 * the editor-title edit icon ($(edit)) shown for schema files.
 */
test('demo-visual-editor-mouse: click the editor-title Edit (visual) icon', () =>
  runDemo('visual-editor-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person.schema.json');

    await clickEditorAction(window, capture, 'JSON Schema: Edit (visual)', 'edit-icon');
    await window.waitForTimeout(4_000);
    await capture('visual-editor-open');

    await window.waitForTimeout(800);
    await capture('visual-editor-open-hold');
  }));
