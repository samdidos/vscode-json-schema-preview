import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import {
  installCursor,
  openFileVisible,
  clickStatusBarItem,
  clickSelector,
  typeSlowly,
} from './helpers/mouse';

/**
 * Mouse-driven twin of demo-binding: the schema picker is opened by clicking the
 * "Schema: unbound" item in the bottom status bar (the binding bar) rather than
 * running the Bind Schema command from the palette.
 */
test('demo-binding-mouse: click the status-bar binding item to bind a schema', () =>
  runDemo('binding-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    // A data file with no inline $schema → the binding bar shows "Schema: unbound".
    await openFileVisible(window, capture, 'person-valid.json');

    // Click the binding item in the bottom status bar.
    await clickStatusBarItem(window, capture, 'Schema:', 'binding-statusbar');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(800);
    await capture('schema-picker');

    // Filter the schema list by typing, then click the matching entry.
    await typeSlowly(window, capture, 'person.schema.json', 'schema-filter');
    await window.waitForTimeout(500);
    await capture('schema-picker-filtered');

    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("person.schema.json")',
      'pick-schema',
    );
    await window.waitForTimeout(2_000);
    // Status bar now shows "$(check) Schema: person.schema.json".
    await capture('status-bar-bound');

    await window.waitForTimeout(700);
    await capture('binding-done-hold');
  }));
