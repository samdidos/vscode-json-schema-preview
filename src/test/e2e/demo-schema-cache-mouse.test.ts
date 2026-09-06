import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { startFixtureHttpServer } from './helpers/fixtureServer';
import { installCursor, clickStatusBarItem, clickSelector, typeSlowly } from './helpers/mouse';

const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["id", "status"],
  "properties": {
    "id": { "type": "integer" },
    "status": { "enum": ["open", "paid", "shipped"] }
  }
}
`;

const DATA_REL_PATH = 'data/remote-order.json';

/**
 * Mouse-driven twin of demo-schema-cache. Caching has no toolbar icon, so this
 * goes through the Command Palette with the animated cursor — but it opens on
 * the status bar showing the remote URL, because "this schema lives on someone
 * else's server" is the problem the command exists to solve, and the bar is
 * where a reader sees it.
 *
 * See demo-schema-cache for why a local HTTP fixture server is required rather
 * than a file on disk.
 */
test('demo-schema-cache-mouse: pull a remote schema local so it survives going offline', async () => {
  const routes: Record<string, string> = { '/order.schema.json': ORDER_SCHEMA };
  const server = await startFixtureHttpServer(routes);

  seedWorkspaceFile(DATA_REL_PATH, `{
  "$schema": "${server.origin}/order.schema.json",
  "id": 4102,
  "status": "paid"
}
`);

  try {
    await runDemo('schema-cache-mouse', async (window, capture) => {
      await installCursor(window);
      await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
      await window.waitForTimeout(1_200);
      await capture('workspace');

      // Hover the binding item — the tooltip names the remote origin.
      await clickStatusBarItem(window, capture, 'Schema:', 'binding-statusbar').catch(() => undefined);
      await window.keyboard.press('Escape');
      await window.waitForTimeout(600);
      await capture('remote-binding');

      await window.keyboard.down('Control');
      await window.keyboard.down('Shift');
      await window.keyboard.press('p');
      await window.keyboard.up('Shift');
      await window.keyboard.up('Control');
      await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
      await capture('command-palette');

      await typeSlowly(window, capture, 'JSON Schema: Cache Schema Locally', 'command-typed');
      await window.waitForTimeout(500);
      await clickSelector(
        window,
        capture,
        '.quick-input-list .monaco-list-row:has-text("Cache Schema Locally")',
        'run-cache',
      );

      await window.waitForTimeout(4_000);
      await capture('cached');

      await window.waitForTimeout(1_200);
      await capture('cached-hold');
    }, true, [DATA_REL_PATH]);
  } finally {
    await server.close();
  }
});
