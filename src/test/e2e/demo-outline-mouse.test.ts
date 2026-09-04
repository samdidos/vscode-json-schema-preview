import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickSelector } from './helpers/mouse';

// Explorer's Outline section, across the VS Code versions this has shipped
// under. The pane header is the mouse target; the rows are what proves it
// rendered.
const OUTLINE_HEADER = '.pane-header:has-text("Outline"), .pane-header[aria-label*="Outline"]';
const OUTLINE_ROWS = '.outline-tree .monaco-list-row, .pane[aria-label*="Outline"] .monaco-list-row';

/**
 * Mouse-driven twin of demo-outline: expand the Explorer's Outline section by
 * clicking its header, then click a property in the tree to jump the editor to
 * its declaration — the gesture that makes the schema-aware outline (F31) worth
 * having, and one a still frame of the tree alone doesn't convey.
 *
 * Every step past opening the file is guarded. This demo has never run in CI,
 * and an unguarded miss on a chrome selector fails the whole refresh-gifs job —
 * taking every *other* demo's GIF down with it, since the capture step is one
 * Playwright invocation. A demo that degrades to a partial capture is a bad
 * GIF worth re-recording; a demo that throws costs the whole run. Go-to-Symbol
 * (Ctrl+Shift+O) is the fallback: same document symbols, same provider, and a
 * quick-input widget whose selector has been stable for years.
 */
test('demo-outline-mouse: expand the Outline and jump to a property', () =>
  runDemo('outline-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person.schema.json');

    await clickSelector(window, capture, OUTLINE_HEADER, 'outline-header').catch(() => undefined);
    const outlineShown = await window
      .waitForSelector(OUTLINE_ROWS, { state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    await window.waitForTimeout(1_000);
    await capture('outline-expanded');

    if (outlineShown) {
      // Click a property in the outline — the editor reveals its declaration.
      await clickSelector(window, capture, '.monaco-list-row:has-text("address")', 'outline-property')
        .catch(() => undefined);
      await window.waitForTimeout(1_200);
      await capture('jumped');
    } else {
      // The Outline pane never rendered. Show the same symbols through
      // Go-to-Symbol so the capture still demonstrates F31 rather than an
      // unchanged editor.
      await window.keyboard.press('Control+Shift+o');
      await window
        .waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 })
        .catch(() => undefined);
      await window.waitForTimeout(1_200);
      await capture('go-to-symbol');
    }

    await window.waitForTimeout(800);
    await capture('hold');
  }));
