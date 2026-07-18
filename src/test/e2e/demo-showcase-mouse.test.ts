import { test } from '@playwright/test';
import path from 'path';
import { launchVSCode, seedUserSettings } from './helpers/launch';
import { startRecording, Recording } from './helpers/recorder';
import { createRealCursor } from './helpers/realCursor';

/**
 * A real screen-recording tour of the extension's core workflow, chained
 * into a single continuous session: open a JSON data file from Explorer,
 * generate a schema from it (F06), close the data file, preview the
 * generated schema (F01), click a field in the rendered HTML, then live-edit
 * the schema and watch the preview refresh (F02). This is the only demo
 * referenced from the README — the per-feature demos stay docs-only, still
 * built the old way (see scripts/make-gifs.mjs).
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
 *     clicks or types;
 *   - stubs Electron's native save dialog (`app.evaluate`) so the freshly
 *     generated schema can be saved to a real path with no dialog ever
 *     appearing on screen — Preview reads a real file from disk (it shells
 *     out to a Python renderer), so it can't render an unsaved buffer, but
 *     the demo still shouldn't show a native file picker.
 * scripts/make-showcase-gif.mjs then converts the recording to
 * docs/public/demo-showcase.gif via ffmpeg's palette pipeline, instead of
 * scripts/make-gifs.mjs's gif-encoder-2 frame-stitching.
 *
 * The preview itself renders with json-schema-for-humans' "flat" template
 * (PreviewWebPanel.ts deliberately avoids the default accordion template,
 * which pulls Bootstrap/jQuery from a CDN — a network request this
 * zero-telemetry extension doesn't make). The flat template has no
 * expand/collapse — every field is already fully rendered — so "click a
 * field" here means clicking a field far enough down the page that
 * Playwright's actionability scroll-into-view is itself the visible motion,
 * not an expand/collapse that doesn't exist in the real product.
 */
test('demo-showcase-mouse: generate, preview, click a field, and live-edit in one flow', async () => {
  // Real video encoding plus several UI flows comfortably exceeds the
  // suite's 120s default (every other demo covers a single feature).
  test.setTimeout(180_000);
  seedUserSettings({ 'jsonschema.preview.liveUpdate': true });

  const display = process.env.DISPLAY;
  if (!display) {
    throw new Error(
      'DISPLAY is not set — this demo records the real X11 screen (ffmpeg -f x11grab) ' +
      'and needs a running X server (Xvfb in CI, a real X session locally).',
    );
  }

  const { app, window, workspaceDir } = await launchVSCode();
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

    // ── 1. Open a JSON file from the file explorer ─────────────────────────
    let explorerVisible = await window.locator('.explorer-folders-view').count() > 0;
    if (!explorerVisible) {
      await window.keyboard.press('Control+Shift+e');
      await window.waitForSelector('.explorer-folders-view', { state: 'visible', timeout: 10_000 });
      explorerVisible = true;
    }

    const dataFolder = window.locator('.explorer-folders-view .monaco-list-row:has-text("data")').first();
    await cursor.glideToLocator(dataFolder);
    await dataFolder.click();
    await window.waitForTimeout(500);

    const dataFile = window.locator(
      '.explorer-folders-view .monaco-list-row:has-text("person-valid.json")',
    ).first();
    await cursor.glideToLocator(dataFile);
    await dataFile.click();
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(600);

    // ── 2. Generate a schema from it (F06) ─────────────────────────────────
    const inferIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Generate Schema from This File"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Generate Schema from This File"]',
    ).first();
    await cursor.glideToLocator(inferIcon);
    await inferIcon.click();
    await window.waitForTimeout(4_000);

    // Save the generated schema to a real path with no visible dialog: Preview
    // needs a real file on disk (it shells a Python renderer), but nothing in
    // this flow should show a native file picker. Standard Playwright/Electron
    // technique — stub the main-process dialog module before triggering it.
    const savedSchemaPath = path.join(workspaceDir, 'schemas', 'generated-schema.json');
    await app.evaluate(({ dialog }, targetPath) => {
      dialog.showSaveDialog = (() => Promise.resolve({ canceled: false, filePath: targetPath })) as typeof dialog.showSaveDialog;
    }, savedSchemaPath);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(2_000); // untitled → real file, tab title updates

    // ── 3. Close the original JSON data file ───────────────────────────────
    const dataTabClose = window.locator('.tab[aria-label*="person-valid.json"] .codicon-close').first();
    await cursor.glideToLocator(dataTabClose);
    await dataTabClose.click();
    await window.waitForTimeout(600);

    // ── 4. Open the JSON schema preview (F01) ──────────────────────────────
    const previewIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Preview"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Preview"]',
    ).first();
    await cursor.glideToLocator(previewIcon);
    await previewIcon.click();
    await window.waitForTimeout(4_000);

    // ── 5. Click a field in the rendered HTML ──────────────────────────────
    // The flat template (see file doc-comment) has no expand/collapse, so
    // "click a field" targets the last property — far enough down the page
    // that Playwright's actionability scroll-into-view is itself the visible
    // motion, landing on a real click target rather than a decorative one.
    const previewFrame = window.frameLocator('iframe.webview.ready').frameLocator('#active-frame');
    const fieldLink = previewFrame.locator('a[href="#createdAt"]').first();
    await fieldLink.waitFor({ state: 'attached', timeout: 15_000 });
    await fieldLink.scrollIntoViewIfNeeded();
    await cursor.glideToLocator(fieldLink);
    await fieldLink.click();
    await window.waitForTimeout(1_200);

    // ── 6. Live-edit the schema and watch the preview refresh (F02) ────────
    const schemaTab = window.locator('.tab[aria-label*="generated-schema.json"]').first();
    await cursor.glideToLocator(schemaTab);
    await schemaTab.click();
    await window.waitForTimeout(500);

    // Anchor on the root opening brace (always line 1, always just "{") rather
    // than any property — createSchema() assigns $schema *last*, so no
    // property has a fixed, predictable position except the very first line.
    const rootBrace = window.locator('.view-line:has-text("{")').first();
    await cursor.glideToLocator(rootBrace);
    await rootBrace.click();
    await window.keyboard.press('End');
    await window.keyboard.press('Enter');
    await window.keyboard.type('  "title": "Person Record",', { delay: 60 });
    await window.waitForTimeout(500);

    await window.keyboard.press('Control+s');
    await window.waitForTimeout(2_800); // debounce + render

    await window.waitForTimeout(1_500); // final hold — a clear rest beat for the GIF loop
  } finally {
    await recording?.stop();
    await app.close();
  }
});
