import { test } from '@playwright/test';
import path from 'path';
import { launchVSCode, seedUserSettings } from './helpers/launch';
import { startRecording, Recording } from './helpers/recorder';
import { createRealCursor } from './helpers/realCursor';

/**
 * A real screen-recording tour of the extension, chained into one continuous
 * session — the only demo GIF referenced from README.md (the per-feature
 * demos stay docs-site-only, see specs/S08-e2e-testing.md's History). The
 * narrative: open a good JSON data file, generate a schema from it and save
 * it (F06), view it in the schema viewer with the raw JSON tabs hidden
 * (F01), live-edit its title and watch the viewer update (F02), configure
 * the viewer to show Expand all/Collapse all (F09) and use them, then switch
 * to a bad JSON example — validate it (a "no schema bound" warning, F03),
 * inline-bind it to the generated schema (F10) via the warning's own action
 * (F04), validate again to see the schema now doing real work, trigger
 * IntelliSense, Ctrl+click the inline `$schema` link to the schema file
 * (built-in VS Code JSON language support — this repo contributes no
 * document-link provider of its own for that field), generate TypeScript
 * types from it (F18), and finish by flipping a VS Code setting
 * (`jsonschema.preview.autoOpen`) to show the preview opening on its own.
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
 * Re-opening the schema file right after hiding it (step 4) uses "Reopen
 * Closed Editor" (Ctrl+Shift+T) rather than the Explorer or Quick Open
 * (Ctrl+P): a CI run proved this the hard way — Explorer's tree only
 * readdir()s a folder on first expand/refresh, and for a file saved via the
 * native-save-dialog stub moments earlier in the same run, that lagged past
 * a 15s wait. Ctrl+Shift+T reuses VS Code's own in-memory editor-history
 * stack instead, with no dependency on the filesystem tree at all — and it
 * reopens exactly the tab just closed. Quick Open has its own documented
 * flakiness for a freshly-seeded/generated fixture (see the History note in
 * S08-e2e-testing.md on two other demos that hit the same thing), so it's
 * avoided too. The Explorer *is* still used once, in step 13 — deliberately,
 * since "browse to a file" is the point being demonstrated there — but only
 * after a full minute of other steps have given the tree time to catch up,
 * and with a retry (re-toggle the folder, wait again) as a second safety net.
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
 * Step 5's wait after picking the "Workspace Folder" settings scope took two
 * real-CI iterations to get right: waiting on any `.monaco-editor .view-lines`
 * is satisfied instantly by the schema editor already on screen from step 4,
 * before `workbench.action.openWorkspaceSettingsFile` (an async command) has
 * actually opened settings.json, racing the following keystrokes into
 * whichever editor still has focus. The first fix — wait for settings.json's
 * own *active* tab by `aria-label` — was itself wrong: CI showed VS Code
 * gives that tab a friendly title like "Folder Settings (JSON)", not the
 * literal filename, so the label substring never matched. Fixed by waiting
 * for the `jsonschema.config` key's actual text (F09-FR-01 guarantees it's
 * seeded) to render on screen instead — a content check, not a label guess.
 *
 * Getting *into* settings.json reliably still wasn't enough: a third CI run
 * got past all of the above and into step 6, then timed out waiting for the
 * "Collapse all" button — the config write silently hadn't taken effect, so
 * the re-rendered preview was still the default "flat" template. F09-FR-01
 * reveals the seeded `{}` value but doesn't reliably leave it *selected* for
 * overtype; typing on that assumption risks landing next to the `{}` instead
 * of replacing it, leaving invalid JSON that VS Code silently falls back
 * from (to the last-known-good, still-empty config) with no visible error —
 * exactly the kind of failure that looks fine on screen and only shows up as
 * "the button I expected never appeared". Fixed by selecting the whole file
 * (Ctrl+A) and typing the complete, valid settings.json content, which can't
 * depend on what was or wasn't pre-selected.
 */
test('demo-showcase-mouse: infer, preview, configure, bind, and generate code in one flow', async () => {
  // Real video encoding plus a dozen distinct UI flows comfortably exceeds
  // the suite's 120s default (every other demo covers a single feature).
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

    // ── 1. Open a good JSON file example ────────────────────────────────────
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

    // ── 2. Generate a schema from it and save it (F06) ─────────────────────
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

    // ── 3. Display the schema viewer, hiding the raw JSON tabs ──────────────
    const dataTabClose = window.locator('.tab[aria-label*="person-valid.json"] .codicon-close').first();
    await cursor.glideToLocator(dataTabClose);
    await dataTabClose.click();
    await window.waitForTimeout(600);

    const previewIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Preview"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Preview"]',
    ).first();
    await cursor.glideToLocator(previewIcon);
    await previewIcon.click();
    await window.waitForTimeout(4_000);

    const schemaTabClose = window.locator('.tab[aria-label*="generated-schema.json"] .codicon-close').first();
    await cursor.glideToLocator(schemaTabClose);
    await schemaTabClose.click();
    await window.waitForTimeout(800); // a beat with only the viewer on screen

    // ── 4. Reopen the schema and live-edit its title (F02) ──────────────────
    // Ctrl+Shift+T ("Reopen Closed Editor") — see the file doc-comment for
    // why this isn't an Explorer click.
    await window.keyboard.down('Control');
    await window.keyboard.down('Shift');
    await window.keyboard.press('t');
    await window.keyboard.up('Shift');
    await window.keyboard.up('Control');
    await window.waitForSelector('.tab[aria-label*="generated-schema.json"]', { state: 'visible', timeout: 15_000 });
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
    await window.waitForTimeout(700);

    // ── 5. Configure the viewer to show Expand all/Collapse all (F09) ───────
    const configureIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Configure Preview"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Configure Preview"]',
    ).first();
    await cursor.glideToLocator(configureIcon);
    await configureIcon.click();
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);

    const workspaceFolderScope = window.locator(
      '.quick-input-list .monaco-list-row:has-text("Workspace Folder")',
    ).first();
    await cursor.glideToLocator(workspaceFolderScope);
    await workspaceFolderScope.click();
    // `workbench.action.openWorkspaceSettingsFile` is async — waiting on any
    // `.monaco-editor .view-lines` is satisfied instantly by the schema
    // editor that's *already* on screen, before settings.json has actually
    // opened, which races the keystrokes below into whichever editor still
    // has focus. A tab-label wait (tried and failed in CI: VS Code shows a
    // friendly name like "Folder Settings (JSON)", not the literal filename,
    // so `[aria-label*="settings.json"]` never matched) is also the wrong
    // signal — wait instead for the actual `jsonschema.config` key
    // (F09-FR-01 guarantees it's seeded) to render on screen, which only
    // happens once the right file's content is showing.
    const settingsLine = window.locator('.view-line:has-text("jsonschema.config")').first();
    await settingsLine.waitFor({ state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(600);
    // Visible isn't the same as focused — click into it so Ctrl+A below
    // selects settings.json's content, not whatever last had keyboard focus.
    await cursor.glideToLocator(settingsLine);
    await settingsLine.click();
    await window.waitForTimeout(200);

    // F09-FR-01 reveals the (freshly-seeded {}) jsonschema.config value, but
    // doesn't reliably leave it *selected* for overtype — typing assuming a
    // selection risks inserting next to the existing {} instead of replacing
    // it, leaving invalid JSON that VS Code silently ignores in favour of the
    // last-known-good (empty) config, so the preview keeps rendering "flat"
    // (no Expand/Collapse) with no visible error. Select-all and retype the
    // whole file instead — this can't depend on what was pre-selected.
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.type(
      '{ "jsonschema.config": { "template_name": "js", "expand_buttons": true } }',
      { delay: 20 },
    );
    await window.waitForTimeout(400);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(600);

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
    await window.waitForTimeout(4_000);

    // ── 6. Collapse all, then expand all ────────────────────────────────────
    const previewFrame = window.frameLocator('iframe.webview.ready').frameLocator('#active-frame');
    const collapseAllBtn = previewFrame.locator('button:has-text("Collapse all")').first();
    await collapseAllBtn.waitFor({ state: 'attached', timeout: 15_000 });
    await cursor.glideToLocator(collapseAllBtn);
    await collapseAllBtn.click();
    await window.waitForTimeout(900);

    const expandAllBtn = previewFrame.locator('button:has-text("Expand all")').first();
    await cursor.glideToLocator(expandAllBtn);
    await expandAllBtn.click();
    await window.waitForTimeout(900);

    // ── 7. Close all tabs and open a bad JSON example ───────────────────────
    await window.keyboard.down('Control');
    await window.keyboard.press('k');
    await window.keyboard.press('w');
    await window.keyboard.up('Control');
    await window.waitForTimeout(800);

    const badDataFile = window.locator(
      '.explorer-folders-view .monaco-list-row:has-text("person-invalid.json")',
    ).first();
    await cursor.glideToLocator(badDataFile);
    await badDataFile.click();
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(600);

    // ── 8. Validate (warning: no schema bound), then inline-bind to the ────
    //      generated schema (F03, F04, F10) ─────────────────────────────────
    const validateIcon = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="JSON Schema: Validate This File"], ' +
      '.editor-actions .action-item a.action-label[title*="JSON Schema: Validate This File"]',
    ).first();
    await cursor.glideToLocator(validateIcon);
    await validateIcon.click();
    await window.waitForSelector('.notification-list-item .monaco-button:has-text("Bind Schema")', {
      state: 'visible',
      timeout: 10_000,
    });
    await window.waitForTimeout(500);

    const bindSchemaAction = window.locator(
      '.notification-list-item .monaco-button:has-text("Bind Schema")',
    ).first();
    await cursor.glideToLocator(bindSchemaAction);
    await bindSchemaAction.click();
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);

    await window.keyboard.type('generated-schema.json', { delay: 40 });
    const schemaPickRow = window.locator(
      '.quick-input-list .monaco-list-row:has-text("generated-schema.json")',
    ).first();
    await schemaPickRow.waitFor({ state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(300);
    await cursor.glideToLocator(schemaPickRow);
    await schemaPickRow.click();

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    const inlineScope = window.locator(
      '.quick-input-list .monaco-list-row:has-text("Inline (this file)")',
    ).first();
    await cursor.glideToLocator(inlineScope);
    await inlineScope.click();
    await window.waitForTimeout(1_200); // workspace edit lands, document reformats

    // ── 9. Validate again — the binding now does real work ──────────────────
    await cursor.glideToLocator(validateIcon);
    await validateIcon.click();
    await window.waitForTimeout(1_500);
    await window.waitForSelector('.monaco-editor .squiggly-error, .monaco-editor .squiggly-warning', {
      state: 'visible',
      timeout: 10_000,
    }).catch(() => { /* diagnostics may render as Problems-panel-only depending on theme */ });
    await window.waitForTimeout(800);

    // ── 10. Show IntelliSense ────────────────────────────────────────────────
    // "$schema" is now the file's first line, pushing every original line down
    // by one — "role" (line 6 in the fixture) is line 7 once inline-bound.
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('7', { delay: 30 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('End');
    // Select the invalid enum value ("superuser") and retype the opening
    // quote so a suggestion widget has something to complete.
    await window.keyboard.press('Home');
    await window.keyboard.press('Shift+End');
    await window.keyboard.type('"role": "', { delay: 40 });
    await window.keyboard.press('Control+Space');
    await window.waitForSelector('.suggest-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(900);

    const adminSuggestion = window.locator('.suggest-widget .monaco-list-row:has-text("admin")').first();
    await cursor.glideToLocator(adminSuggestion);
    await adminSuggestion.click();
    await window.keyboard.type('",', { delay: 40 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(1_500);

    // ── 11. Ctrl+click the inline $schema link to open the schema file ─────
    // Built-in VS Code JSON language support turns a "$schema" value into a
    // clickable document link — no code in this extension is involved.
    await window.keyboard.press('Control+Home');
    await window.waitForTimeout(400);
    const schemaLink = window.locator('.view-line span:has-text("generated-schema.json")').last();
    await schemaLink.waitFor({ state: 'visible', timeout: 10_000 });
    const linkBox = await schemaLink.boundingBox();
    if (!linkBox) { throw new Error('No bounding box for the $schema link span'); }
    await cursor.glideTo(bounds.x + linkBox.x + linkBox.width / 2, bounds.y + linkBox.y + linkBox.height / 2);
    await window.keyboard.down('Control');
    await schemaLink.click({ modifiers: ['Control'] });
    await window.keyboard.up('Control');
    await window.waitForSelector('.tab[aria-label*="generated-schema.json"]', { state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(800);

    // ── 12. Generate TypeScript code from the schema (F18) ──────────────────
    const moreActions = window.locator(
      '.editor-actions .action-item a.action-label[aria-label*="More Actions"], ' +
      '.editor-actions .action-item a.action-label.codicon-toolbar-more',
    ).first();
    await cursor.glideToLocator(moreActions);
    await moreActions.click();
    await window.waitForSelector('.monaco-menu', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(400);

    const generateTypesEntry = window.locator(
      '.monaco-menu .action-item .action-label:has-text("Generate Types from This Schema")',
    ).first();
    await cursor.glideToLocator(generateTypesEntry);
    await generateTypesEntry.click();

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
    await window.waitForTimeout(3_500);

    // ── 13. Flip a VS Code setting to show an interesting configurable ─────
    //       feature: auto-opening the preview whenever a schema file is
    //       opened (jsonschema.preview.autoOpen — no icon of its own, so
    //       this goes through the Settings UI rather than a toolbar click).
    await window.keyboard.down('Control');
    await window.keyboard.press('k');
    await window.keyboard.press('w');
    await window.keyboard.up('Control');
    await window.waitForTimeout(600);

    await window.keyboard.press('Control+,');
    await window.waitForSelector('.settings-editor', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(600);

    const settingsSearch = window.locator('.settings-editor .suggest-input-container input').first();
    await cursor.glideToLocator(settingsSearch);
    await settingsSearch.click();
    await window.keyboard.type('jsonschema.preview.autoOpen', { delay: 30 });
    await window.waitForTimeout(700);

    const autoOpenCheckbox = window.locator(
      '.settings-editor .setting-item-contents:has-text("Auto Open") input[type="checkbox"]',
    ).first();
    await cursor.glideToLocator(autoOpenCheckbox);
    await autoOpenCheckbox.click();
    await window.waitForTimeout(600);

    const settingsTabClose = window.locator('.tab[aria-label*="Settings"] .codicon-close').first();
    await cursor.glideToLocator(settingsTabClose);
    await settingsTabClose.click();
    await window.waitForTimeout(500);

    // Browse to the schema file via Explorer — deliberately, since "browse to
    // a file" is the point being demonstrated here, unlike step 4's reopen.
    // A full minute of other steps has passed since the file was written, so
    // the readdir-on-first-expand lag that broke step 4's Explorer attempt
    // shouldn't recur, but re-toggle-and-retry once anyway as a second net.
    const schemasFolder = window.locator('.explorer-folders-view .monaco-list-row:has-text("schemas")').first();
    await cursor.glideToLocator(schemasFolder);
    await schemasFolder.click();
    await window.waitForTimeout(500);

    const schemaFile = window.locator(
      '.explorer-folders-view .monaco-list-row:has-text("generated-schema.json")',
    ).first();
    try {
      await schemaFile.waitFor({ state: 'visible', timeout: 8_000 });
    } catch {
      await schemasFolder.click(); // collapse
      await window.waitForTimeout(400);
      await schemasFolder.click(); // re-expand — forces a fresh readdir
      await schemaFile.waitFor({ state: 'visible', timeout: 15_000 });
    }
    await cursor.glideToLocator(schemaFile);
    await schemaFile.click();
    await window.waitForSelector('iframe.webview.ready', { state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(1_500);

    await window.waitForTimeout(1_500); // final hold — a clear rest beat for the GIF loop
  } finally {
    await recording?.stop();
    await app.close();
  }
});
