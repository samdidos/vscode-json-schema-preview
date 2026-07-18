import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile, runCommand } from './helpers/ui';
import { seedUserSettings } from './helpers/launch';

/**
 * Command-palette twin of demo-showcase-mouse (S08-SR-11): exercises the
 * same underlying commands — Generate Schema, Preview, edit + live-update —
 * for crash/broken-selector smoke coverage (S08-SR-10). Its frames are not
 * consumed by any GIF pipeline.
 *
 * Deliberately simpler than the mouse version: it previews the existing,
 * already-saved person.schema.json rather than the just-generated one, so it
 * doesn't need the mouse version's native-save-dialog stub or webview
 * frame-interaction — this twin's only job is smoke-testing the commands
 * involved, not reproducing the showcase narrative frame for frame.
 */
test('demo-showcase: generate a schema, then preview and live-edit a schema', () => {
  seedUserSettings({ 'jsonschema.preview.liveUpdate': true });

  return runDemo('showcase', async (window, capture) => {
    await capture('workspace');

    // ── 1. Generate a schema from raw data (F06) ──────────────────────────
    await openFile(window, 'person-valid.json');
    await runCommand(window, 'JSON Schema: Generate Schema from This File');
    await window.waitForTimeout(4_000);
    await capture('inferred-schema');
    await window.keyboard.press('Control+w'); // close the generated-schema tab/column
    await window.waitForTimeout(400);

    // ── 2. Close the original data file ────────────────────────────────────
    await openFile(window, 'person-valid.json');
    await window.keyboard.press('Control+w');
    await window.waitForTimeout(400);

    // ── 3. Preview a schema, then live-edit it (F01, F02) ──────────────────
    await openFile(window, 'person.schema.json');
    await runCommand(window, 'JSON Schema: Preview');
    await window.waitForTimeout(3_500);
    await capture('preview-open');

    await openFile(window, 'person.schema.json');
    await window.waitForTimeout(400);
    // Line 4 is `"title": "Person",` — go there, then step back over the
    // closing quote and comma so the edit lands inside the string value.
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('4', { delay: 30 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowLeft');
    await window.keyboard.press('ArrowLeft');
    await window.keyboard.type(' (Draft)', { delay: 30 });
    await capture('schema-being-edited');

    await window.keyboard.press('Control+s');
    await window.waitForTimeout(2_800);
    await capture('preview-live-updated');

    await window.waitForTimeout(500);
    await capture('preview-live-updated-hold');
  });
});
