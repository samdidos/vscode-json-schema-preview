import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { startFixtureHttpServer } from './helpers/fixtureServer';

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
 * F08 through the **quick fix on the `$schema` line**, not the Command
 * Palette.
 *
 * An earlier version of this demo drove `jsonschema.cacheSchemaLocally` from
 * the palette and was removed after CI proved it impossible: the command is
 * contributed with `"when": "false"`, so it is deliberately unreachable there.
 * Worse, the palette twin *passed* while doing nothing — `runCommand` types a
 * name, presses Enter on whatever is highlighted, and returns, which is a
 * silent no-op when the command is absent (S08-SR-19, and the History note on
 * assertions that cannot fail).
 *
 * The real entry point is SchemaAuthCodeActionProvider, which offers the fix
 * whenever the cursor sits on a line carrying a **remote** `$schema` URL. It
 * does not require a failed fetch: schema-load diagnostics only make the
 * action preferred and attach it to the lightbulb glyph, so a plain
 * Ctrl+. reaches it on a perfectly healthy schema.
 *
 * The URL must genuinely be remote (`isRemoteUrl`), so this needs the loopback
 * fixture server S08-NFR-02 sanctions — a path on disk is refused by the
 * command before it does anything.
 */
test('demo-schema-cache: cache a remote schema locally from the $schema quick fix', async () => {
  const routes: Record<string, string> = { '/order.schema.json': ORDER_SCHEMA };
  const server = await startFixtureHttpServer(routes);

  seedWorkspaceFile(DATA_REL_PATH, `{
  "$schema": "${server.origin}/order.schema.json",
  "id": 4102,
  "status": "paid"
}
`);

  try {
    await runDemo('schema-cache', async (window, capture) => {
      await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
      await window.waitForTimeout(1_200);
      // The status bar shows the remote origin this file depends on.
      await capture('remote-binding');

      // Put the cursor on the `$schema` line — line 2 — which is the only
      // condition the quick fix is gated on.
      await window.keyboard.press('Control+g');
      await window.waitForTimeout(300);
      await window.keyboard.type('2', { delay: 40 });
      await window.keyboard.press('Enter');
      await window.keyboard.press('End');
      await window.waitForTimeout(600);
      await capture('cursor-on-schema');

      await window.keyboard.press('Control+.');
      await window.waitForSelector('.action-widget .monaco-list-row', {
        state: 'visible',
        timeout: 15_000,
      });
      await window.waitForTimeout(900);
      await capture('quick-fix-menu');

      const cacheRow = window.locator(
        '.action-widget .monaco-list-row:has-text("Cache schema locally")',
      ).first();
      await cacheRow.waitFor({ state: 'visible', timeout: 10_000 });
      await cacheRow.click();

      // FATAL. The download is the whole feature, and it is the part with
      // nothing else on screen to give it away — the `$schema` line does not
      // change, only the binding behind it does. A demo that captured the
      // menu closing and called it done would show nothing (S08-SR-19).
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
