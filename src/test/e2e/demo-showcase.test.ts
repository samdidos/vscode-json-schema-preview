import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile, runCommand } from './helpers/ui';
import { seedUserSettings } from './helpers/launch';

/**
 * Command-palette twin of demo-showcase-mouse (S08-SR-11): exercises the same
 * chained workflow — infer, preview + live-edit, bind, validate, generate
 * types — through the real UI for crash/broken-selector smoke coverage
 * (S08-SR-10). Its frames are not consumed by scripts/make-gifs.mjs.
 */
test('demo-showcase: generate, preview, bind, validate, and generate types in one flow', async () => {
  // Five chained feature flows in one VS Code session comfortably exceed the
  // suite's 120s default (every other demo covers a single feature).
  test.setTimeout(180_000);
  seedUserSettings({ 'jsonschema.preview.liveUpdate': true });

  await runDemo('showcase', async (window, capture) => {
    await capture('workspace');

    // ── 1. Generate a schema from raw data (F06) ──────────────────────────
    await openFile(window, 'person-valid.json');
    await runCommand(window, 'JSON Schema: Generate Schema from This File');
    await window.waitForTimeout(4_000);
    await capture('inferred-schema');
    await window.keyboard.press('Control+w');
    await window.waitForTimeout(400);

    // ── 2. Preview the schema, then live-edit it (F01, F02) ───────────────
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

    // ── 3. Bind a second data file to that schema (F04) ────────────────────
    await openFile(window, 'person-invalid.json');
    await runCommand(window, 'JSON Schema: Bind Schema');
    await window.waitForTimeout(2_000);
    await capture('schema-picker');
    await window.keyboard.type('person.schema.json', { delay: 30 });
    await window.waitForTimeout(400);
    await window.keyboard.press('Enter');
    await window.waitForTimeout(2_000);
    await capture('status-bar-bound');

    // ── 4. Validate — the deliberately-broken values fail (F03) ───────────
    await runCommand(window, 'JSON Schema: Validate This File');
    await window.waitForTimeout(4_000);
    await capture('validation-errors');

    // ── 5. Generate TypeScript types from the schema (F18) ────────────────
    await openFile(window, 'person.schema.json');
    await runCommand(window, 'JSON Schema: Generate Types from This Schema');
    await window.waitForTimeout(800);
    await capture('codegen-language-picker');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(800);
    await capture('codegen-destination-picker');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(5_000);
    await capture('codegen-generated-types');

    await window.waitForTimeout(800);
    await capture('codegen-generated-types-hold');
  });
});
