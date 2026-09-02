import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickSelector } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-outline: expand the Explorer's Outline section by
 * clicking its header, then click a property in the tree to jump the editor to
 * its declaration — the gesture that makes the schema-aware outline (F31) worth
 * having, and one a still frame of the tree alone doesn't convey.
 */
test('demo-outline-mouse: expand the Outline and jump to a property', () =>
  runDemo('outline-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'person.schema.json');

    // The Outline section header sits at the bottom of the Explorer, collapsed.
    await clickSelector(
      window,
      capture,
      '.pane-header:has-text("Outline"), .pane-header[aria-label*="Outline"]',
      'outline-header',
    );
    await window
      .waitForSelector('.outline-tree .monaco-list-row, .pane[aria-label*="Outline"] .monaco-list-row', {
        state: 'visible',
        timeout: 15_000,
      })
      .catch(() => undefined);
    await window.waitForTimeout(1_000);
    await capture('outline-expanded');

    // Click a property in the outline — the editor reveals its declaration.
    await clickSelector(
      window,
      capture,
      '.monaco-list-row:has-text("address")',
      'outline-property',
    );
    await window.waitForTimeout(1_200);
    await capture('jumped');

    await window.waitForTimeout(800);
    await capture('jumped-hold');
  }));
