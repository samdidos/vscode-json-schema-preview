import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedUserSettings } from './helpers/launch';
import {
  installCursor,
  openFileVisible,
  clickEditorAction,
  clickEditorOverflowAction,
  clickStatusBarItem,
  clickSelector,
  typeSlowly,
} from './helpers/mouse';

/**
 * Mouse-driven, end-to-end tour of the extension's core workflow, chained
 * into a single continuous session instead of five separate ones: generate a
 * schema from data (F06), preview it and watch a live edit refresh it (F01,
 * F02), bind a second data file to that schema from the status bar (F04),
 * validate it and see the deliberately-broken values fail (F03), then
 * generate TypeScript types from the schema (F18). This is the only demo
 * referenced from the README (the per-feature demos above stay docs-only) —
 * see scripts/make-gifs.mjs's `showcase` entry and README.md.
 *
 * Reuses the exact interactions of demo-inference-mouse, demo-live-update-mouse,
 * demo-binding-mouse, demo-validation-mouse, and demo-codegen-mouse — each
 * already proven reliable on its own — rather than inventing new selectors.
 */
test('demo-showcase-mouse: generate, preview, bind, validate, and generate types in one flow', async () => {
  // Five chained feature flows in one VS Code session comfortably exceed the
  // suite's 120s default (every other demo covers a single feature).
  test.setTimeout(180_000);
  seedUserSettings({ 'jsonschema.preview.liveUpdate': true });

  await runDemo('showcase-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    // ── 1. Generate a schema from raw data (F06) ──────────────────────────
    await openFileVisible(window, capture, 'person-valid.json');
    await clickEditorAction(
      window,
      capture,
      'JSON Schema: Generate Schema from This File',
      'infer',
    );
    await window.waitForTimeout(4_000);
    await capture('infer-inferred-schema');

    // Close the generated-schema tab/column so the rest of the tour stays
    // in a single editor group.
    await window.waitForTimeout(500);
    await window.keyboard.press('Control+w');
    await window.waitForTimeout(400);

    // ── 2. Preview the schema, then live-edit it (F01, F02) ───────────────
    await openFileVisible(window, capture, 'person.schema.json');
    await clickEditorAction(window, capture, 'JSON Schema: Preview', 'preview');
    await window.waitForTimeout(3_500);
    await capture('preview-open');

    await clickSelector(window, capture, '.tab[aria-label*="person.schema.json"]', 'schema-tab');
    await window.waitForTimeout(400);

    // Click the "title" line, jump to end-of-line, then step back over the
    // closing quote and trailing comma so the appended text lands *inside*
    // the string value ("Person (Draft)") instead of after it — appending
    // straight after End would land past the comma and break the JSON.
    await clickSelector(window, capture, '.view-line:has-text("title")', 'title-line');
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowLeft');
    await window.keyboard.press('ArrowLeft');
    await typeSlowly(window, capture, ' (Draft)', 'edit-title');
    await capture('schema-being-edited');

    await window.keyboard.press('Control+s');
    await window.waitForTimeout(2_800); // debounce + render
    await capture('preview-live-updated');

    // ── 3. Bind a second data file to that schema from the status bar (F04) ─
    await openFileVisible(window, capture, 'person-invalid.json');
    await clickStatusBarItem(window, capture, 'Schema:', 'bind-statusbar');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(700);
    await capture('schema-picker');

    await typeSlowly(window, capture, 'person.schema.json', 'schema-filter');
    await window.waitForTimeout(500);
    await capture('schema-picker-filtered');

    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("person.schema.json")',
      'pick-schema',
    );
    await window.waitForTimeout(1_800);
    await capture('status-bar-bound');

    // ── 4. Validate — the deliberately-broken values fail (F03) ───────────
    await clickEditorAction(window, capture, 'JSON Schema: Validate This File', 'validate');
    await window.waitForTimeout(4_000);
    await capture('validation-errors');

    // Put the cursor on the invalid id ("not-a-number") for a close-up beat.
    await clickSelector(window, capture, '.view-line:has-text("not-a-number")', 'bad-value');
    await window.waitForTimeout(700);
    await capture('validation-errors-detail');

    // ── 5. Generate TypeScript types from the schema (F18) ────────────────
    await clickSelector(window, capture, '.tab[aria-label*="person.schema.json"]', 'schema-tab-again');
    await window.waitForTimeout(500);

    await clickEditorOverflowAction(
      window,
      capture,
      'Generate Types from This Schema',
      'codegen',
    );

    // Target-language picker — TypeScript is the first/default item; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('codegen-language-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'codegen-language-pick');

    // Destination picker — "Open in a new editor" is the default; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('codegen-destination-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'codegen-destination-pick');

    await window.waitForTimeout(5_000);
    await capture('codegen-generated-types');

    await window.waitForTimeout(900);
    await capture('codegen-generated-types-hold');
  });
});
