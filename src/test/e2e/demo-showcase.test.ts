import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile, runCommand, waitForNotification } from './helpers/ui';
import { seedUserSettings } from './helpers/launch';

/**
 * Command-palette twin of demo-showcase-mouse (S08-SR-11): exercises the
 * same underlying commands — Generate Schema, Preview, edit + live-update,
 * Configure Preview, Validate, Bind Schema (inline), Generate Types — for
 * crash/broken-selector smoke coverage (S08-SR-10). Its frames are not
 * consumed by any GIF pipeline.
 *
 * Deliberately simpler than the mouse version: it previews/binds/generates
 * against the existing, already-saved person.schema.json rather than the
 * just-generated one, so it doesn't need the mouse version's
 * native-save-dialog stub, webview frame-interaction, or IntelliSense/
 * Ctrl+click steps (those exercise built-in VS Code JSON language features,
 * not this extension's own commands, so they add nothing to command
 * smoke-testing) — this twin's only job is smoke-testing the commands
 * involved, not reproducing the showcase narrative frame for frame.
 */
test('demo-showcase: generate, preview, configure, validate, bind, and generate types', () => {
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

    // ── 4. Configure the viewer via settings (F09) ─────────────────────────
    await runCommand(window, 'JSON Schema: Configure Preview');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 }).catch(() => {});
    // Single-folder workspace with no committed config file: the picker may
    // resolve automatically (one applicable scope) or show a list — either
    // way, Enter accepts the (first/only) offered scope.
    await window.keyboard.press('Enter');
    await window.waitForTimeout(1_000);
    await capture('configure-settings-open');
    await window.keyboard.press('Control+w'); // close settings.json without editing
    await window.waitForTimeout(400);

    // ── 5. Validate an unbound file, then inline-bind it (F03, F04, F10) ───
    await openFile(window, 'person-invalid.json');
    await runCommand(window, 'JSON Schema: Validate This File');
    await waitForNotification(window, 'No schema bound');
    await capture('validate-no-schema-warning');

    const bindAction = window.locator('.notification-list-item .monaco-button:has-text("Bind Schema")').first();
    await bindAction.click();
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.type('person.schema.json', { delay: 30 });
    await window.waitForSelector('.quick-input-list .monaco-list-row:has-text("person.schema.json")', {
      timeout: 10_000,
    });
    await window.keyboard.press('Enter');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.type('Inline', { delay: 30 });
    await window.waitForSelector('.quick-input-list .monaco-list-row:has-text("Inline")', { timeout: 10_000 });
    await window.keyboard.press('Enter');
    await window.waitForTimeout(1_000);
    await capture('inline-bound');

    await runCommand(window, 'JSON Schema: Validate This File');
    await window.waitForTimeout(1_500);
    await capture('validate-against-bound-schema');

    // ── 6. Generate types from the schema (F18) ────────────────────────────
    await openFile(window, 'person.schema.json');
    await runCommand(window, 'JSON Schema: Generate Types from This Schema');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.press('Enter'); // TypeScript — first/default
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.press('Enter'); // new untitled editor — first/default
    await window.waitForTimeout(2_500);
    await capture('generated-types');

    await window.waitForTimeout(500);
    await capture('preview-live-updated-hold');
  });
});
