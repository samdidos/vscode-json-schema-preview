import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { startFixtureHttpServer } from './helpers/fixtureServer';
import { runCommand } from './helpers/ui';

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
 * F08 is defined entirely in terms of a *remote* schema: the command refuses
 * outright unless the bound URL is remote (`isRemoteUrl`), so there is no way
 * to demonstrate it against a file on disk. S08-NFR-02's sanctioned answer is a
 * local HTTP fixture server, which is what this uses — a real origin the
 * extension host fetches over real HTTP, reachable from nowhere else.
 */
test('demo-schema-cache: download a remote schema so it works offline', async () => {
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
      // The status bar shows the remote URL it is bound to.
      await capture('remote-binding');

      await runCommand(window, 'JSON Schema: Cache Schema Locally');
      // The download runs under a progress notification, then rewrites the
      // binding to point at the local copy.
      await window.waitForTimeout(4_000);
      await capture('cached');

      await window.waitForTimeout(1_200);
      await capture('cached-hold');
    }, true, [DATA_REL_PATH]);
  } finally {
    await server.close();
  }
});
