import { test } from '@playwright/test';
import path from 'path';
import { launchVSCode, seedUserSettings } from './helpers/launch';
import { openFile } from './helpers/ui';
import { startRecording, Recording } from './helpers/recorder';
import { createRealCursor } from './helpers/realCursor';

/**
 * A real screen-recording tour of the extension's core workflow, chained
 * into a single continuous session: generate a schema from data (F06),
 * preview it and watch a live edit refresh it (F01, F02), bind a second data
 * file to that schema from the status bar (F04), validate it and see the
 * deliberately-broken values fail (F03), then generate TypeScript types from
 * the schema (F18). This is the only demo referenced from the README — the
 * per-feature demos stay docs-only, still built the old way (see below).
 *
 * Unlike every other demo, this one is NOT stitched from Playwright
 * screenshots (a Playwright-dispatched mouse move never moves the real OS
 * pointer, so those recordings fake a cursor with an animated DOM overlay —
 * see helpers/mouse.ts). This test instead:
 *   - records the real X11 display with `ffmpeg -f x11grab` (helpers/recorder.ts),
 *     which captures whatever the X server actually composites, including a
 *     genuine system cursor;
 *   - drives that cursor with `xdotool` (helpers/realCursor.ts) in lockstep
 *     with the actual UI actions, which still go through Playwright
 *     (`locator.click()`, `window.keyboard`) for the same reliability every
 *     other demo depends on — xdotool only moves the pointer, it never
 *     clicks or types.
 * scripts/make-showcase-gif.mjs then converts the recording to
 * docs/public/demo-showcase.gif via ffmpeg's palette pipeline, instead of
 * scripts/make-gifs.mjs's gif-encoder-2 frame-stitching.
 */
test('demo-showcase-mouse: generate, preview, bind, validate, and generate types in one flow', async () => {
  // Five chained feature flows plus real video encoding comfortably exceed
  // the suite's 120s default (every other demo covers a single feature).
  test.setTimeout(180_000);
  seedUserSettings({ 'jsonschema.preview.liveUpdate': true });

  const display = process.env.DISPLAY;
  if (!display) {
    throw new Error(
      'DISPLAY is not set — this demo records the real X11 screen (ffmpeg -f x11grab) ' +
      'and needs a running X server (Xvfb in CI, a real X session locally).',
    );
  }

  const { app, window } = await launchVSCode();
  let recording: Recording | undefined;

  try {
    const bounds = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getContentBounds();
    });

    recording = startRecording(display, bounds, path.join(process.cwd(), 'videos', 'showcase.mp4'));
    await window.waitForTimeout(1_000); // let ffmpeg actually start grabbing frames

    const cursor = createRealCursor({ x: bounds.x, y: bounds.y });
    await cursor.glideTo(bounds.x + 700, bounds.y + 460, 1); // snap to a known starting mark
    await window.waitForTimeout(600);

    // ── 1. Generate a schema from raw data (F06) ──────────────────────────
    await openFile(window, 'person-valid.json');

    const inferIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Generate Schema from This File"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Generate Schema from This File"]',
    ).first();
    await cursor.glideToLocator(inferIcon);
    await inferIcon.click();
    await window.waitForTimeout(4_000);

    // Close the generated-schema tab/column so the rest of the tour stays in
    // a single editor group.
    await window.keyboard.press('Control+w');
    await window.waitForTimeout(600);

    // ── 2. Preview the schema, then live-edit it (F01, F02) ───────────────
    await openFile(window, 'person.schema.json');

    const previewIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Preview"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Preview"]',
    ).first();
    await cursor.glideToLocator(previewIcon);
    await previewIcon.click();
    await window.waitForTimeout(3_500);

    const schemaTab = window.locator('.tab[aria-label*="person.schema.json"]').first();
    await cursor.glideToLocator(schemaTab);
    await schemaTab.click();
    await window.waitForTimeout(500);

    // Click the "title" line, jump to end-of-line, then step back over the
    // closing quote and trailing comma so the appended text lands *inside*
    // the string value ("Person (Draft)") instead of after it — appending
    // straight after End would land past the comma and break the JSON.
    const titleLine = window.locator('.view-line:has-text("title")').first();
    await cursor.glideToLocator(titleLine);
    await titleLine.click();
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowLeft');
    await window.keyboard.press('ArrowLeft');
    await window.keyboard.type(' (Draft)', { delay: 75 });
    await window.waitForTimeout(500);

    await window.keyboard.press('Control+s');
    await window.waitForTimeout(2_800); // debounce + render

    // ── 3. Bind a second data file to that schema from the status bar (F04) ─
    await openFile(window, 'person-invalid.json');

    const bindStatusItem = window.locator('.statusbar-item:has-text("Schema:")').first();
    await cursor.glideToLocator(bindStatusItem);
    await bindStatusItem.click();
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(700);
    await window.keyboard.type('person.schema.json', { delay: 60 });
    await window.waitForTimeout(500);

    const schemaRow = window.locator('.quick-input-list .monaco-list-row:has-text("person.schema.json")').first();
    await cursor.glideToLocator(schemaRow);
    await schemaRow.click();
    await window.waitForTimeout(1_800);

    // ── 4. Validate — the deliberately-broken values fail (F03) ───────────
    const validateIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Validate This File"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Validate This File"]',
    ).first();
    await cursor.glideToLocator(validateIcon);
    await validateIcon.click();
    await window.waitForTimeout(4_000);

    // Put the cursor on the invalid id ("not-a-number") for a close-up beat.
    const badValueLine = window.locator('.view-line:has-text("not-a-number")').first();
    await cursor.glideToLocator(badValueLine);
    await badValueLine.click();
    await window.waitForTimeout(1_500);

    // ── 5. Generate TypeScript types from the schema (F18) ────────────────
    const schemaTabAgain = window.locator('.tab[aria-label*="person.schema.json"]').first();
    await cursor.glideToLocator(schemaTabAgain);
    await schemaTabAgain.click();
    await window.waitForTimeout(500);

    const moreActions = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="More Actions"], ' +
      '.editor-actions .action-item a.action-label.codicon-toolbar-more',
    ).first();
    await cursor.glideToLocator(moreActions);
    await moreActions.click();
    await window.waitForSelector('.monaco-menu', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(400);

    const codegenItem = window.locator(
      '.monaco-menu .action-item .action-label:has-text("Generate Types from This Schema")',
    ).first();
    await cursor.glideToLocator(codegenItem);
    await codegenItem.click();

    // Target-language picker — TypeScript is the first/default item; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    const languageRow = window.locator('.quick-input-list .monaco-list-row').first();
    await cursor.glideToLocator(languageRow);
    await languageRow.click();

    // Destination picker — "Open in a new editor" is the default; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    const destinationRow = window.locator('.quick-input-list .monaco-list-row').first();
    await cursor.glideToLocator(destinationRow);
    await destinationRow.click();

    await window.waitForTimeout(5_000);
    await window.waitForTimeout(1_500); // final hold — a clear rest beat for the GIF loop
  } finally {
    await recording?.stop();
    await app.close();
  }
});
