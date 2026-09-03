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
 * The schema editor and the preview sit side by side from step 3 onward, and
 * the schema tab is never closed. An earlier cut closed it for "a beat with
 * only the viewer on screen": that read well as a still, and broke everything
 * after it. Closing the last editor in a group makes VS Code remove the
 * group, promoting the preview to full width — and the reopened schema editor
 * then landed *inside the preview's own group* as a new tab, hiding the
 * preview behind it for the rest of the run. Measured on the shipped GIF: the
 * preview was on screen for 7 of 92 seconds, and neither of the two steps
 * that exist to show it changing — the live title edit (F02) and the
 * configure step adding Expand all/Collapse all (F09) — had it visible at
 * all. Keeping the split is also the honest product experience: you edit on
 * the left and watch the docs refresh on the right. `expectPreviewVisible()`
 * asserts it at each of those moments, so the same silent failure cannot
 * return (S08-SR-19).
 *
 * Not closing the tab also removes the need to reopen it, and with it the
 * flakiness that choice was working around: the Explorer tree only readdir()s
 * a folder on first expand, which lagged past a 15s wait for a file saved via
 * the native-save-dialog stub moments earlier, and Quick Open has its own
 * documented trouble with freshly-generated fixtures (see the History note in
 * S08-e2e-testing.md on two other demos that hit it). The Explorer is still
 * used once, in step 13 — deliberately, since "browse to a file" is the point
 * being demonstrated there — but only after a full minute of other steps have
 * given the tree time to catch up, and with a retry (re-toggle the folder,
 * wait again) as a second safety net.
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
 *
 * Step 11's Ctrl+click on the `$schema` document link resisted three real-CI
 * iterations in a row — a longer pre-click wait, then a same-click retry —
 * neither of which changed the outcome, which rules out "clicked too early"
 * and "needs a second click" without identifying what the actual problem is.
 * That's not verifiable further without live VS Code access (this repo
 * contributes no document-link provider of its own for a *data* file's
 * `$schema` field, so if the built-in one doesn't behave the way assumed
 * here, there's no source in this repo to inspect for why). Rather than
 * keep guessing blind, the click is still attempted (twice) since it's the
 * more faithful demonstration when it works, but a Quick Open fallback with
 * the known relative path guarantees the schema file ends up open regardless
 * — step 12 needs it active, and a stalled demo here would block everything
 * after it for no benefit.
 *
 * Step 13's Auto Open checkbox took three real-CI iterations of its own: a
 * Settings-UI-specific class, then `.monaco-list-row` with an assumed label,
 * then a plain `input[type="checkbox"]` — all missed, the last two with an
 * outright zero-match timeout rather than a near-miss. The common thread
 * gave it away: VS Code's Settings UI renders boolean settings with its own
 * `Toggle`/`Checkbox` widget, a `div[role="checkbox"]` with no underlying
 * `<input>` element at all, so no selector built on `input[type="checkbox"]`
 * could ever have matched. Fixed by targeting `[role="checkbox"]` instead —
 * confirmed by a real CI run that got past it into the very next step.
 *
 * That next step — closing the Settings tab via a guessed
 * `.tab[aria-label*="Settings"] .codicon-close` selector — then missed the
 * same way (zero matches). Rather than guess yet another close-button
 * structure, it now reuses the pattern that already proved reliable twice
 * earlier in this same test for editor management (Close All Editors): a
 * keyboard shortcut, `Ctrl+W`, closing whatever tab is currently active — no
 * DOM selector involved at all.
 *
 * The final Explorer lookup (browsing to the schema file, step 13's closing
 * beat) then failed even past its own collapse/re-expand retry. Root cause:
 * `explorer.autoReveal` (VS Code's default) had already expanded "schemas"
 * earlier in the test — generated-schema.json had already been the active
 * editor more than once (e.g. step 11's Ctrl+click) — so the original
 * "click once to expand" assumed a starting state that wasn't actually
 * true, collapsing an already-open folder instead, and the retry's own two
 * more blind clicks didn't reliably undo that. Fixed by reading each row's
 * `aria-expanded` attribute before clicking, so the folder ends up expanded
 * regardless of which state it started in.
 *
 * With that fixed, the test ran to its very last line — waiting for the
 * preview webview to auto-open after clicking the schema file, proving
 * `jsonschema.preview.autoOpen` actually did something — and timed out
 * there instead. The unscoped `.settings-editor [role="checkbox"]` selector
 * for the Auto Open toggle (previous fix, above) apparently found and
 * clicked *something* without erroring, just not the right thing: the
 * Settings editor's own search/filter toolbar (e.g. a "Only show modified
 * settings" filter) uses the same `role="checkbox"` widget and sits earlier
 * in DOM order than the results list, so an unscoped `.first()` could land
 * there instead. Scoped to `.monaco-list-row [role="checkbox"]` — the
 * search query is still the exact full setting ID, so exactly one result
 * row renders, and scoping to it excludes every toolbar control above it.
 *
 * That row-scoped fix, run for real (31293043167), failed at the exact same
 * spot again — meaning either the click still isn't landing as a real
 * toggle, or the wait afterward is simply too tight for a cold-start
 * webview panel this late in a 12+-minute run (Close All Editors, just
 * before this, disposes the panel opened back in step 3, so this recreates
 * it from scratch rather than reusing one). Verifying `aria-checked` and
 * retrying, plus widening the final webview wait from 15s to 30s, addressed
 * both — and still failed identically (run 31293471507), even hitting the
 * full 30s. A consistent failure at the same spot across selector, retry,
 * *and* timing changes means the mutation itself was never taking effect,
 * not any particular guess about how to trigger or verify it — and there's
 * no way to see what a custom, unlabelled Settings UI widget actually did
 * without CI screenshot access. Rather than keep guessing at that widget,
 * step 13 now edits settings.json directly instead (Ctrl+A, full retype),
 * the same mechanism already proven reliable for step 5's settings change.
 *
 * That rewrite itself then failed in real CI (31293925609) one step
 * earlier than before — opening settings.json via the command palette never
 * actually landed. Two things differed from the rest of the file's *proven*
 * Ctrl+Shift patterns: a single `'Control+Shift+p'` combo string instead of
 * the down/press/up sequence Reopen Closed Editor already relies on, and
 * pressing Enter on the palette's default-highlighted row instead of
 * clicking the exact row already confirmed to exist. Fixed both to match
 * the file's established, CI-proven patterns.
 *
 * Both of those fixes held — the very next real CI run (31294290306) got
 * past opening the command palette and selecting the entry, then failed
 * one line later, waiting for `.tab[aria-label*="settings.json"]`. This is
 * a trap step 5 already documented above: VS Code titles this tab something
 * friendly ("Settings (JSON)" for the user scope here, "Folder Settings
 * (JSON)" for step 5's workspace scope), never the literal filename, so a
 * label-substring guess can't match either scope. Fixed the same way step 5
 * was: stop guessing the label and wait for editor content instead — since
 * Close All Editors ran moments earlier, any `.monaco-editor .view-lines`
 * becoming visible is unambiguous here.
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

    /**
     * Fails the capture if the preview webview is not actually on screen.
     *
     * S08-SR-19: a step that exists to show the docs panel changing has to
     * have the docs panel visible. The defect this guards against was silent —
     * the recording still completed, every click still landed, and the GIF
     * shipped for months showing a full-width editor at exactly the moments
     * the narrative was about. Nothing failed, so nothing said so.
     *
     * `.isVisible()` is the check rather than a `waitFor`: by every call site
     * the panel should already be up, so waiting would mask a slow reveal
     * rather than report it.
     */
    const expectPreviewVisible = async (moment: string): Promise<void> => {
      const panel = window.locator('iframe.webview.ready').first();
      if (!(await panel.isVisible().catch(() => false))) {
        throw new Error(
          `The preview panel is not on screen at "${moment}". This step is ` +
          'about the rendered docs changing, so a capture without them shows ' +
          'nothing (S08-SR-19). Most likely the editor group holding the ' +
          'preview was collapsed or the schema editor opened on top of it.',
        );
      }
    };

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
    await expectPreviewVisible('opened beside the schema');
    await window.waitForTimeout(4_000);

    // The schema tab deliberately stays open — see the file doc-comment. The
    // editor is on the left, the rendered docs on the right, and every step
    // below happens with both on screen.

    // ── 4. Live-edit the schema's title and watch the preview refresh (F02) ─

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
    // The whole point of this step: the docs panel is on screen and has just
    // re-rendered with the new title.
    await expectPreviewVisible('live title update');
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
    await expectPreviewVisible('configured render template');
    await window.waitForTimeout(4_000);

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
    const previewFrame = window.frameLocator('iframe.webview.ready').frameLocator('#active-frame');
    const collapseAllBtn = previewFrame.locator('button:has-text("Collapse all")').first();
    await collapseAllBtn.waitFor({ state: 'attached', timeout: 15_000 });
    await cursor.glideToLocator(collapseAllBtn);
    await collapseAllBtn.click({ force: true });
    await window.waitForTimeout(900);

    const expandAllBtn = previewFrame.locator('button:has-text("Expand all")').first();
    await cursor.glideToLocator(expandAllBtn);
    await expandAllBtn.click({ force: true });
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

    // Pick the first row rather than text-matching "admin": real CI showed no
    // row ever matched that substring within 15s, even though the widget
    // itself was confirmed visible above — the exact label text/markup
    // wasn't provable without live access. The schema declares
    // `"enum": ["admin", "editor", "viewer"]`, and vscode-json-languageservice
    // preserves that order in its suggestions, so the first row is "admin" in
    // practice — this just doesn't hard-depend on that being visible text.
    const topSuggestion = window.locator('.suggest-widget .monaco-list-row').first();
    await cursor.glideToLocator(topSuggestion);
    await topSuggestion.click();
    await window.keyboard.type('",', { delay: 40 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(1_500);

    // ── 11. Ctrl+click the inline $schema link to open the schema file ─────
    // Built-in VS Code JSON language support turns a "$schema" value into a
    // clickable document link — no code in this extension is involved.
    await window.keyboard.press('Control+Home');
    const schemaLink = window.locator('.view-line span:has-text("generated-schema.json")').last();
    await schemaLink.waitFor({ state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(1_500);
    await cursor.glideToLocator(schemaLink);
    await schemaLink.click({ modifiers: ['Control'] });

    const schemaTabVisible = () =>
      window.waitForSelector('.tab[aria-label*="generated-schema.json"]', { state: 'visible', timeout: 6_000 })
        .then(() => true).catch(() => false);

    // Three real CI runs in a row failed to navigate from this exact click —
    // a longer pre-click wait and a same-click retry each ruled out one
    // theory (not "too early", not "needs a second click") without fixing
    // it, which points at something more fundamental than click timing that
    // isn't verifiable without live VS Code access. Rather than keep
    // guessing blind, fall back to Quick Open with the known relative path
    // so the demo makes forward progress (step 12 needs the schema file
    // active) regardless — a no-op skip on any run where the click does work.
    if (!(await schemaTabVisible())) {
      await schemaLink.click({ modifiers: ['Control'] });
      if (!(await schemaTabVisible())) {
        await window.keyboard.press('Control+p');
        await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
        await window.keyboard.type('generated-schema.json', { delay: 30 });
        await window.waitForSelector(
          '.quick-input-list .monaco-list-row:has-text("generated-schema.json")',
          { timeout: 10_000 },
        );
        await window.keyboard.press('Enter');
        await window.waitForSelector('.tab[aria-label*="generated-schema.json"]', { state: 'visible', timeout: 15_000 });
      }
    }
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
    //       this goes through settings.json rather than a toolbar click;
    //       see the History note above for why not the Settings UI).
    await window.keyboard.down('Control');
    await window.keyboard.press('k');
    await window.keyboard.press('w');
    await window.keyboard.up('Control');
    await window.waitForTimeout(600);

    // Four real-CI iterations in a row all failed at the exact same later
    // point — the preview webview never appearing after clicking the schema
    // file — even as the mitigations tried got progressively more
    // fundamental: scoping the checkbox selector to its results row,
    // verifying+retrying on `aria-checked`, and finally widening the wait to
    // 30s (which *still* timed out, ruling out "just needed more time"). A
    // consistent failure at the same spot across unrelated selector/timing
    // changes points at the mutation itself never taking effect, not at any
    // particular selector guessed for it — and there's no way to visually
    // confirm what a custom, unlabelled Settings UI widget actually did
    // without CI screenshot access. Rather than keep guessing at that
    // widget, this switches to the mechanism that already proved reliable
    // for step 5's settings change: editing settings.json directly (Ctrl+A,
    // full retype) instead of clicking a UI control. The retype includes
    // `jsonschema.preview.liveUpdate` (seeded at launch, below) alongside
    // the new key, so this doesn't silently drop it.
    // A real CI run (31293925609) timed out right after this point too —
    // waiting for settings.json's tab, meaning the command never actually
    // ran. Two things differ here from the rest of the file's *proven*
    // Ctrl+Shift shortcuts (e.g. Reopen Closed Editor): the single combo
    // string `'Control+Shift+p'` instead of the down/press/up pattern used
    // everywhere else, and blindly pressing Enter on whatever the palette's
    // default-highlighted row happens to be instead of clicking the exact
    // row already confirmed to exist. Matching the proven pattern for both.
    await window.keyboard.down('Control');
    await window.keyboard.down('Shift');
    await window.keyboard.press('p');
    await window.keyboard.up('Shift');
    await window.keyboard.up('Control');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.keyboard.type('Preferences: Open User Settings (JSON)', { delay: 20 });
    const openSettingsJsonEntry = window.locator(
      '.quick-input-list .monaco-list-row:has-text("Open User Settings (JSON)")',
    ).first();
    await openSettingsJsonEntry.waitFor({ state: 'visible', timeout: 10_000 });
    await openSettingsJsonEntry.click();
    // Not a `.tab[aria-label*="settings.json"]` wait: this file's own step 5
    // already hit this exact trap once — VS Code gives this tab a friendly
    // title ("Settings (JSON)" for the user scope, "Folder Settings (JSON)"
    // for workspace), never the literal filename, so a label-substring guess
    // can't match. Every other tab was closed via Close All Editors moments
    // ago, so waiting for any editor content at all is unambiguous here.
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(500);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.type(
      '{ "jsonschema.preview.liveUpdate": true, "jsonschema.preview.autoOpen": true }',
      { delay: 20 },
    );
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(1_000);

    await window.keyboard.press('Control+w');
    await window.waitForTimeout(500);

    // Browse to the schema file via Explorer — deliberately, since "browse to
    // a file" is the point being demonstrated here, unlike step 4's reopen.
    // A full minute of other steps has passed since the file was written, so
    // the readdir-on-first-expand lag that broke step 4's Explorer attempt
    // shouldn't recur — but a real CI run (31292251675) still failed here,
    // even after the old version's blind collapse/re-expand retry. Root
    // cause: `explorer.autoReveal` (VS Code's default) had already expanded
    // "schemas" earlier in this same test — generated-schema.json became the
    // active editor more than once before this point (e.g. step 11's
    // Ctrl+click), and VS Code auto-expands/reveals the active editor's
    // containing folder as a side effect. A blind click assuming "starts
    // collapsed" then *collapses* an already-expanded folder instead, and
    // the retry's own two blind clicks don't reliably cancel that out.
    // Reading the row's actual `aria-expanded` state before each click fixes
    // it for either starting state.
    const schemasFolder = window.locator('.explorer-folders-view .monaco-list-row:has-text("schemas")').first();
    await cursor.glideToLocator(schemasFolder);
    if ((await schemasFolder.getAttribute('aria-expanded')) !== 'true') {
      await schemasFolder.click();
      await window.waitForTimeout(500);
    }

    const schemaFile = window.locator(
      '.explorer-folders-view .monaco-list-row:has-text("generated-schema.json")',
    ).first();
    try {
      await schemaFile.waitFor({ state: 'visible', timeout: 8_000 });
    } catch {
      // Genuine readdir lag rather than a wrong state guess: force a fresh
      // collapse/re-expand cycle, checking state before each click so the
      // two toggles can't cancel out or double up.
      if ((await schemasFolder.getAttribute('aria-expanded')) === 'true') {
        await schemasFolder.click();
        await window.waitForTimeout(400);
      }
      await schemasFolder.click();
      await schemaFile.waitFor({ state: 'visible', timeout: 15_000 });
    }
    await cursor.glideToLocator(schemaFile);
    await schemaFile.click();
    // Widened from 15s: Close All Editors (step 13's opening beat, above)
    // disposes the panel opened back in step 3, so this recreates it from
    // scratch — a cold Python-subprocess render, plus general CI load 12+
    // minutes into the test — rather than reusing/reconfiguring an existing
    // one the way every other step in between did. The very first creation
    // (step 3) never actually proved its own completion time; it just moved
    // on after a blind 4s pause. 30s gives real headroom to rule that out.
    await window.waitForSelector('iframe.webview.ready', { state: 'visible', timeout: 30_000 });
    await window.waitForTimeout(1_500);

    await window.waitForTimeout(1_500); // final hold — a clear rest beat for the GIF loop
  } finally {
    await recording?.stop();
    await app.close();
  }
});
