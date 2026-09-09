import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { startFixtureHttpServer } from './helpers/fixtureServer';
import { installCursor, clickSelector } from './helpers/mouse';

// Same fixture as demo-schema-cache — see that file for why the URL must be
// served over loopback HTTP rather than read from disk.
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
 * Mouse-driven twin of demo-schema-cache: click the `$schema` line, open the
 * quick fixes, take the caching one.
 *
 * The click is the demo. "This file points at a schema on someone else's
 * server, and the fix is one lightbulb away" is a thing you discover by
 * putting the cursor on the line — not by knowing a command name, which is
 * just as well, because this command is deliberately hidden from the palette.
 *
 * No status-bar click: an earlier cut opened the binding picker for a look at
 * the remote URL and escaped out of it, which left focus outside the editor
 * and broke every step after. The bar already shows the URL.
 */
test('demo-schema-cache-mouse: pull a remote schema local from the lightbulb', async () => {
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
      await capture('remote-binding');

      // Click the `$schema` line — the only thing the quick fix is gated on.
      await clickSelector(window, capture, '.view-line:has-text("$schema")', 'click-schema-line');
      await window.waitForTimeout(700);
      await capture('cursor-on-schema');

      // The lightbulb glyph only renders when a diagnostic is attached, and
      // this schema resolves fine, so there is nothing wrong to flag. Ctrl+.
      // opens the same menu regardless — the actions are offered on the line,
      // not on an error.
      await window.keyboard.press('Control+.');
      await window.waitForSelector('.action-widget .monaco-list-row', {
        state: 'visible',
        timeout: 15_000,
      });
      await window.waitForTimeout(900);
      await capture('quick-fix-menu');

      await clickSelector(
        window,
        capture,
        '.action-widget .monaco-list-row:has-text("Cache schema locally")',
        'apply-cache',
      );

      // FATAL — see demo-schema-cache for why this cannot be a guarded wait.
      try {
        await window.waitForSelector('.notification-list-item:has-text("Schema cached")', {
          state: 'visible',
          timeout: 30_000,
        });
      } catch {
        throw new Error(
          'The "Schema cached" confirmation never appeared, so the download ' +
          'did not complete — the capture shows a menu closing and nothing ' +
          'else (S08-SR-19). Most likely the fixture server was unreachable ' +
          'from the extension host, or the quick fix ran a different action.',
        );
      }
      await window.waitForTimeout(1_200);
      await capture('cached');

      await window.waitForTimeout(1_000);
      await capture('cached-hold');
    }, true, [DATA_REL_PATH]);
  } finally {
    await server.close();
  }
});
