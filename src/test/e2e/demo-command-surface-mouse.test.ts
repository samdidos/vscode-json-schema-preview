import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickSelector, typeSlowly } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-command-surface. Where the palette variant shows
 * the `JSON Schema:` prefix, this one shows the other half of F34: the grouped
 * **submenu** in the editor toolbar. Every command that has no icon of its own
 * lives under one "JSON Schema" entry there, which is how a reader who never
 * opens the palette finds the same list.
 *
 * Then the walkthrough, opened by clicking through the Help menu rather than
 * typing a command — the route a first-time user actually takes.
 */
test('demo-command-surface-mouse: browse the grouped toolbar menu, then the walkthrough', () =>
  runDemo('command-surface-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await openFileVisible(window, capture, 'person.schema.json');

    // Open the editor-title overflow and hover the grouped submenu — the whole
    // command list on screen at once, without a palette.
    await clickSelector(
      window,
      capture,
      '.editor-actions .action-item a.action-label[aria-label*="More Actions"], ' +
      '.editor-actions .action-item a.action-label.codicon-toolbar-more',
      'overflow',
    );
    await window.waitForSelector('.monaco-menu', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('overflow-menu');

    const submenu = window.locator(
      '.monaco-menu .action-item.monaco-submenu-item:has-text("JSON Schema"), ' +
      '.monaco-menu .action-item:has(.submenu-indicator):has-text("JSON Schema")',
    ).first();
    if (await submenu.isVisible().catch(() => false)) {
      await clickSelector(
        window,
        capture,
        '.monaco-menu .action-item.monaco-submenu-item:has-text("JSON Schema"), ' +
        '.monaco-menu .action-item:has(.submenu-indicator):has-text("JSON Schema")',
        'submenu',
      ).catch(() => undefined);
      await submenu.hover().catch(() => undefined);
      await window.waitForTimeout(900);
      await capture('submenu-open');
      await window.waitForTimeout(1_000);
      await capture('submenu-hold');
    }

    await window.keyboard.press('Escape');
    await window.waitForTimeout(400);

    // The walkthrough, through the palette — VS Code's Help menu is a native
    // menu bar on Linux, which a webview-level click cannot reach.
    await window.keyboard.down('Control');
    await window.keyboard.down('Shift');
    await window.keyboard.press('p');
    await window.keyboard.up('Shift');
    await window.keyboard.up('Control');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await typeSlowly(window, capture, 'Welcome: Open Walkthrough', 'walkthrough-command', 45);
    await window.waitForTimeout(500);
    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("Open Walkthrough")',
      'run-walkthrough',
    );

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await window.waitForTimeout(800);
    await capture('walkthrough-picker');
    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("JSON Schema Preview")',
      'pick-walkthrough',
    ).catch(async () => { await window.keyboard.press('Enter'); });

    await window.waitForTimeout(3_000);
    await capture('walkthrough');

    await window.waitForTimeout(1_500);
    await capture('walkthrough-hold');
  }));
