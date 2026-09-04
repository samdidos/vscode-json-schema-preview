import { test } from '@playwright/test';
import path from 'path';
import { launchVSCode, seedUserSettings } from './helpers/launch';
import { startRecording, Recording } from './helpers/recorder';
import { createRealCursor } from './helpers/realCursor';

/**
 * A real screen-recording tour of the extension, chained into one continuous
 * session — the only demo GIF referenced from README.md (the per-feature
 * demos stay docs-site-only, see specs/S08-e2e-testing.md's History).
 *
 * The narrative is one unbroken thread: open a good JSON data file, generate
 * a schema from it and save it (F06), open the schema viewer beside it (F01),
 * live-edit the schema's title and watch the docs refresh (F02), configure
 * the viewer to add Expand all/Collapse all (F09) and use them, then generate
 * TypeScript types from the same schema (F18).
 *
 * It used to carry a second act as well — switch to a bad JSON file, validate
 * it, inline-bind it from the warning's own action, validate again, trigger
 * IntelliSense, Ctrl+click the `$schema` link — roughly half the running time.
 * That was cut deliberately: it read as a second, unrelated demo bolted onto
 * the first, it re-introduced a full-width editor with no preview on screen
 * for ~45 consecutive seconds, and every feature in it (F03, F04) already has
 * its own focused demo on the docs site. What remains is one story told once.
 * F10 (inline binding) was the only feature whose *sole* demo was this middle
 * act; it is now on the S08 demo backlog rather than buried mid-tour here.
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
 * scripts/make-gifs.mjs's frame-stitching.
 *
 * The schema editor and the preview sit side by side from step 3 to the end,
 * and the schema tab is never closed. An earlier cut closed it for "a beat
 * with only the viewer on screen": that read well as a still, and broke
 * everything after it. Closing the last editor in a group makes VS Code
 * remove the group, promoting the preview to full width — and the reopened
 * schema editor then landed *inside the preview's own group* as a new tab,
 * hiding the preview behind it for the rest of the run. Measured on the
 * shipped GIF: the preview was on screen for 7 of 92 seconds, and neither of
 * the two steps that exist to show it changing — the live title edit (F02)
 * and the configure step adding Expand all/Collapse all (F09) — had it
 * visible at all. Keeping the split is also the honest product experience:
 * you edit on the left and watch the docs refresh on the right.
 * `expectPreviewRendered()` asserts it at each of those moments, so the same
 * silent failure cannot return (S08-SR-19).
 *
 * The Expand all/Collapse all buttons (steps 5/6) require switching the
 * `json-schema-for-humans` template away from the default "flat" one
 * (PreviewWebPanel.ts's normal choice specifically to avoid a CDN fetch —
 * see F01's History) to `js`, which *does* pull jQuery/Bootstrap from a CDN.
 * This was verified directly (headless Chromium against the tool's actual
 * generated output) rather than assumed: the template also references two
 * local sibling assets (`schema_doc.css`/`schema_doc.min.js`) that
 * PreviewWebPanel never serves (it only ever reads the single generated HTML
 * file into a string), but their absence only costs a cosmetic style pass
 * and a harmless `anchorOnLoad` console error — jQuery/Bootstrap loading
 * from the CDN is what actually drives the Expand all/Collapse all buttons
 * (Bootstrap's `data-toggle="collapse"`), and that works. This is an
 * explicit, demo-only opt-in via `jsonschema.config` (F09) — the extension's
 * own default stays "flat" precisely to avoid this network dependency.
 *
 * Two hard-won details survive from earlier CI iterations and must not be
 * "simplified" back:
 *
 * Step 5 waits for the `jsonschema.config` key's actual text after opening
 * the workspace settings file, not for an editor or a tab label. Waiting on
 * any `.monaco-editor .view-lines` is satisfied instantly by the schema
 * editor already on screen, before the async
 * `workbench.action.openWorkspaceSettingsFile` has opened anything — racing
 * the following keystrokes into whichever editor still has focus. Waiting on
 * `.tab[aria-label*="settings.json"]` fails differently: VS Code titles that
 * tab "Folder Settings (JSON)", never the literal filename.
 *
 * Step 5 also selects the whole settings file (Ctrl+A) and retypes it rather
 * than overtyping the revealed `jsonschema.config` value. F09-FR-01 reveals
 * the seeded `{}` but doesn't reliably leave it *selected*; typing on that
 * assumption can land next to the `{}` instead of replacing it, leaving
 * invalid JSON that VS Code silently falls back from (to the last-known-good,
 * still-empty config) with no visible error — which surfaces only as "the
 * Collapse all button never appeared".
 */
test('demo-showcase-mouse: infer, preview, configure and generate code in one flow', async () => {
  // Real video encoding plus several distinct UI flows exceeds the suite's
  // 120s default (every other demo covers a single feature).
  test.setTimeout(240_000);
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

    const previewFrame = () =>
      window.frameLocator('iframe.webview.ready').frameLocator('#active-frame');

    /**
     * Fails the capture if the rendered docs are not actually on screen.
     *
     * S08-SR-19: a step that exists to show the docs panel changing has to
     * have the docs panel visible. The defect this guards against was silent —
     * the recording still completed, every click still landed, and the GIF
     * shipped for months showing a full-width editor at exactly the moments
     * the narrative was about. Nothing failed, so nothing said so.
     *
     * Two waits, because "the webview element is visible" and "the docs have
     * rendered into it" are different facts and only the second is what the
     * capture is about. The element appears well before the Python renderer's
     * HTML lands in it, so asserting only the former would let a frame of
     * empty panel satisfy the guard.
     *
     * `Required` as the content marker: it is emitted by both templates this
     * demo uses — the default "flat" one and the `js` one step 5 switches to —
     * verified by running json-schema-for-humans against this fixture's shape
     * under both, rather than read off a GIF frame. (The untitled first render
     * has no `<h1>` at all, so the obvious heading check would hang there.)
     *
     * Waiting on content is also what lets the fixed beats around these calls
     * be short: the render time is absorbed adaptively here instead of every
     * run paying a worst-case fixed pause (S08-SR-21).
     */
    const expectPreviewRendered = async (moment: string): Promise<void> => {
      try {
        await window.locator('iframe.webview.ready').first()
          .waitFor({ state: 'visible', timeout: 20_000 });
        await previewFrame().getByText('Required').first()
          .waitFor({ state: 'attached', timeout: 20_000 });
      } catch {
        throw new Error(
          `The rendered docs are not on screen at "${moment}". This step is ` +
          'about the preview changing, so a capture without it shows nothing ' +
          '(S08-SR-19). Either the editor group holding the preview was ' +
          'collapsed, the schema editor opened on top of it, or the render ' +
          'never completed.',
        );
      }
    };

    // ── 1. Open a good JSON file example ────────────────────────────────────
    if (await window.locator('.explorer-folders-view').count() === 0) {
      await window.keyboard.press('Control+Shift+e');
      await window.waitForSelector('.explorer-folders-view', { state: 'visible', timeout: 10_000 });
    }

    const dataFolder = window.locator('.explorer-folders-view .monaco-list-row:has-text("data")').first();
    await cursor.glideToLocator(dataFolder);
    await dataFolder.click();
    await window.waitForTimeout(400);

    const dataFile = window.locator(
      '.explorer-folders-view .monaco-list-row:has-text("person-valid.json")',
    ).first();
    await cursor.glideToLocator(dataFile);
    await dataFile.click();
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(600);

    // ── 2. Generate a schema from it and save it (F06) ─────────────────────
    const inferIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Generate Schema from This File"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Generate Schema from This File"]',
    ).first();
    await cursor.glideToLocator(inferIcon);
    await inferIcon.click();
    // Inference is local TypeScript, not a subprocess — this is a reading
    // beat for the viewer, not a wait for the feature.
    await window.waitForTimeout(2_500);

    // Save the generated schema to a real path with no visible dialog: Preview
    // needs a real file on disk (it shells a Python renderer), but nothing in
    // this flow should show a native file picker. Standard Playwright/Electron
    // technique — stub the main-process dialog module before triggering it.
    const savedSchemaPath = path.join(workspaceDir, 'schemas', 'generated-schema.json');
    await app.evaluate(({ dialog }, targetPath) => {
      dialog.showSaveDialog = (() => Promise.resolve({ canceled: false, filePath: targetPath })) as typeof dialog.showSaveDialog;
    }, savedSchemaPath);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(1_500); // untitled → real file, tab title updates

    // ── 3. Hide the raw data tab and open the schema viewer beside it (F01) ─
    // Glide to the *tab*, not straight to its close button. VS Code only
    // reveals `.codicon-close` on the active or hovered tab, and
    // glideToLocator waits for visibility *before* it moves the pointer — so
    // aiming at the icon on a background tab waits for the very thing only
    // that move would produce. It resolved by luck for a long time and stopped
    // on VS Code 1.136.1, timing out the whole recording. Clicking the tab
    // makes it active, which reveals its close button; the keyboard shortcut
    // is the fallback, the same deterministic editor management used below.
    const dataTab = window.locator('.tab[aria-label*="person-valid.json"]').first();
    await cursor.glideToLocator(dataTab);
    await dataTab.click();
    await window.waitForTimeout(300);

    const dataTabClose = dataTab.locator('.codicon-close').first();
    if (await dataTabClose.isVisible().catch(() => false)) {
      await cursor.glideToLocator(dataTabClose);
      await dataTabClose.click();
    } else {
      await window.keyboard.press('Control+w');
    }
    await window.waitForTimeout(500);

    const previewIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Preview"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Preview"]',
    ).first();
    await cursor.glideToLocator(previewIcon);
    await previewIcon.click();
    await window.waitForTimeout(800);
    await expectPreviewRendered('opened beside the schema');
    await window.waitForTimeout(900); // let the reader take in the split view

    // ── 4. Live-edit the schema's title and watch the preview refresh (F02) ─
    // Anchor on the root opening brace (always line 1, always just "{") rather
    // than any property — createSchema() assigns $schema *last*, so no
    // property has a fixed, predictable position except the very first line.
    const rootBrace = window.locator('.view-line:has-text("{")').first();
    await cursor.glideToLocator(rootBrace);
    await rootBrace.click();
    await window.keyboard.press('End');
    await window.keyboard.press('Enter');
    await window.keyboard.type('  "title": "Person Record",', { delay: 55 });
    await window.waitForTimeout(400);

    await window.keyboard.press('Control+s');
    await window.waitForTimeout(900); // live-update debounce
    // The whole point of this step: the docs are on screen and have just
    // re-rendered with the new title.
    await expectPreviewRendered('live title update');
    await window.waitForTimeout(1_100);

    // ── 5. Configure the viewer to show Expand all/Collapse all (F09) ───────
    const configureIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Configure Preview"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Configure Preview"]',
    ).first();
    await cursor.glideToLocator(configureIcon);
    await configureIcon.click();
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(400);

    const workspaceFolderScope = window.locator(
      '.quick-input-list .monaco-list-row:has-text("Workspace Folder")',
    ).first();
    await cursor.glideToLocator(workspaceFolderScope);
    await workspaceFolderScope.click();

    // Content check, not a tab-label or bare-editor check — see the file
    // doc-comment for why both of those fail here.
    const settingsLine = window.locator('.view-line:has-text("jsonschema.config")').first();
    await settingsLine.waitFor({ state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    // Visible isn't the same as focused — click into it so Ctrl+A below
    // selects settings.json's content, not whatever last had keyboard focus.
    await cursor.glideToLocator(settingsLine);
    await settingsLine.click();
    await window.waitForTimeout(200);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.type(
      '{ "jsonschema.config": { "template_name": "js", "expand_buttons": true } }',
      { delay: 18 },
    );
    await window.waitForTimeout(300);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(500);

    // Settings changes don't auto-refresh an open preview — re-run Preview on
    // the schema tab to pick up the new template. Escape first: a defensive
    // net against any lingering overlay (e.g. a suggestion widget from typing
    // into a schema-validated settings.json) intercepting the click.
    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);
    const schemaTab = window.locator('.tab[aria-label*="generated-schema.json"]').first();
    await cursor.glideToLocator(schemaTab);
    await schemaTab.click();
    await window.waitForTimeout(400);
    await cursor.glideToLocator(previewIcon);
    await previewIcon.click();
    await window.waitForTimeout(800);
    await expectPreviewRendered('configured render template');
    await window.waitForTimeout(700);

    // ── 6. Collapse all, then expand all ────────────────────────────────────
    // `force: true` on both clicks: real CI showed Playwright's actionability
    // check (attached, visible, enabled, *and* two consecutive frames with an
    // unchanged bounding box) resolve the element but never pass the
    // stability half, for the full 30s, on this specific button — a static
    // Bootstrap button at the very top of the page, above all the collapsible
    // content, with nothing that should legitimately be moving it. Likelier
    // a webview-inside-Xvfb-inside-Electron rendering quirk than a real UI
    // problem; `attached` state was already confirmed above, and a plain
    // Bootstrap `data-toggle="collapse"` button doesn't need a precise real
    // hover/stability state to work correctly when clicked.
    const collapseAllBtn = previewFrame().locator('button:has-text("Collapse all")').first();
    await collapseAllBtn.waitFor({ state: 'attached', timeout: 15_000 });
    await cursor.glideToLocator(collapseAllBtn);
    await collapseAllBtn.click({ force: true });
    await window.waitForTimeout(900);

    const expandAllBtn = previewFrame().locator('button:has-text("Expand all")').first();
    await cursor.glideToLocator(expandAllBtn);
    await expandAllBtn.click({ force: true });
    await window.waitForTimeout(1_000);

    // ── 7. Generate TypeScript types from the same schema (F18) ─────────────
    // The schema editor is still open on the left, so no navigation is needed
    // to get here — click its tab to make it the active editor and the
    // toolbar is the one that belongs to it.
    await cursor.glideToLocator(schemaTab);
    await schemaTab.click();
    await window.waitForTimeout(400);

    const moreActions = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="More Actions"], ' +
      '.editor-actions .action-item a.action-label.codicon-toolbar-more',
    ).first();
    await cursor.glideToLocator(moreActions);
    await moreActions.click();
    await window.waitForSelector('.monaco-menu', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(400);

    // More Actions does not list the generate commands directly: `editor/title`
    // contributes the `jsonschema.schemaMenu` *submenu* (labelled "JSON
    // Schema"), and every non-icon command lives one level down inside it.
    // Hovering is what opens a monaco submenu; the click is a fallback for the
    // case where the pointer lands without the mouseover registering. Showing
    // the submenu open is better demo content anyway — it puts the extension's
    // whole action list on screen instead of one anonymous menu row.
    const generateTypesEntry = window.locator(
      '.monaco-menu .action-item .action-label:has-text("Generate Types from This Schema")',
    ).first();
    const schemaSubmenu = window.locator(
      '.monaco-menu .action-item.monaco-submenu-item:has-text("JSON Schema"), ' +
      '.monaco-menu .action-item:has(.submenu-indicator):has-text("JSON Schema")',
    ).first();

    if (await schemaSubmenu.isVisible().catch(() => false)) {
      await cursor.glideToLocator(schemaSubmenu);
      await schemaSubmenu.hover();
      await window.waitForTimeout(700);
      if (!(await generateTypesEntry.isVisible().catch(() => false))) {
        await schemaSubmenu.click();
        await window.waitForTimeout(700);
      }
    }

    if (await generateTypesEntry.isVisible().catch(() => false)) {
      await cursor.glideToLocator(generateTypesEntry);
      await generateTypesEntry.click();
    } else {
      // The toolbar this step reaches for now belongs to a *narrowed* editor
      // group (the preview sits beside it), which changes what overflows into
      // More Actions and how deep it nests. The Command Palette runs the same
      // command from a widget whose selector has been stable for years —
      // worth having, since a miss here would cost the whole recording after
      // six steps of correct output.
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
      await window.keyboard.down('Control');
      await window.keyboard.down('Shift');
      await window.keyboard.press('p');
      await window.keyboard.up('Shift');
      await window.keyboard.up('Control');
      await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
      await window.keyboard.type('JSON Schema: Generate Types from This Schema', { delay: 20 });
      const paletteRow = window.locator(
        '.quick-input-list .monaco-list-row:has-text("Generate Types from This Schema")',
      ).first();
      await paletteRow.waitFor({ state: 'visible', timeout: 10_000 });
      await cursor.glideToLocator(paletteRow);
      await paletteRow.click();
    }

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500); // TypeScript is first/default — click it
    const languageRow = window.locator('.quick-input-list .monaco-list-row').first();
    await cursor.glideToLocator(languageRow);
    await languageRow.click();

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500); // "Open in a new editor" is first/default
    const destinationRow = window.locator('.quick-input-list .monaco-list-row').first();
    await cursor.glideToLocator(destinationRow);
    await destinationRow.click();

    // The generated types open in their own editor — the closing image, and
    // the last thing worth reading before the GIF loops.
    await window.waitForTimeout(3_000);
    await window.waitForTimeout(1_500); // final hold — a clear rest beat for the loop
  } finally {
    await recording?.stop();
    await app.close();
  }
});
