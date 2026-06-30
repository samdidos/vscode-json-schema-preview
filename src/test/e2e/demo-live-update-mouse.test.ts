import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedUserSettings } from './helpers/launch';
import { installCursor, openFileVisible, clickEditorAction, clickSelector, typeSlowly } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-live-update: the preview is opened via the editor
 * title icon, then the schema title is edited (with visible typing) to trigger a
 * live refresh.
 */
test('demo-live-update-mouse: open preview via icon, then live-edit the schema', () => {
  // Pre-seed liveUpdate so the demo goes straight to the live-refresh behaviour.
  seedUserSettings({ 'jsonschema.preview.liveUpdate': true });

  return runDemo('live-update-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'bookshelf.schema.yaml');

    await clickEditorAction(window, capture, 'JSON Schema: Preview', 'preview-icon');
    await window.waitForTimeout(4_000);
    await capture('preview-open');

    // Focus the schema editor again by clicking its tab.
    await clickSelector(window, capture, '.tab[aria-label*="bookshelf.schema.yaml"]', 'schema-tab');
    await window.waitForTimeout(500);

    // Jump to the title line and append text with visible typing.
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('2', { delay: 60 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('End');
    await typeSlowly(window, capture, ' (Updated)', 'edit-title');
    await capture('schema-being-edited');

    await window.keyboard.press('Control+s');
    await window.waitForTimeout(3_000); // debounce + render
    await capture('preview-live-updated');

    await window.waitForTimeout(800);
    await capture('preview-live-updated-hold');
  });
});
