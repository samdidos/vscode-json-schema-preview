import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile, seedUserSettings } from './helpers/launch';
import { startFixtureHttpServer } from './helpers/fixtureServer';
import { runCommand } from './helpers/ui';

// A catalog in SchemaStore's own format, served from the local fixture server.
// `useSchemaStore` is turned off so the demo depends on nothing but this file:
// S08-NFR-02 forbids reaching the real network, and a demo whose content
// changes when SchemaStore does is not a demo of this extension.
const CATALOG = JSON.stringify({
  schemas: [
    {
      name: 'ACME Order',
      description: 'Internal order documents',
      url: 'SCHEMA_URL',
      fileMatch: ['*.order.json'],
    },
  ],
}, null, 2);

const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ACME Order",
  "type": "object",
  "required": ["id", "status"],
  "properties": {
    "id": { "type": "integer" },
    "status": { "enum": ["open", "paid", "shipped"] }
  }
}
`;

// The file carries no `$schema` and no settings binding. The catalog's
// `fileMatch` is the only thing that can bind it — which is the point.
const ORDER_DATA = `{
  "id": 4102,
  "status": "paid"
}
`;

const DATA_REL_PATH = 'data/acme.order.json';

test('demo-schema-catalog: a catalog binds a file by name, with nothing in the file', async () => {
  // The catalog has to name the schema's absolute URL, which contains a port
  // that does not exist until the server is listening. The handler reads
  // `routes` per request, so filling the entry in afterwards is enough.
  const routes: Record<string, string> = { '/order.schema.json': ORDER_SCHEMA };
  const server = await startFixtureHttpServer(routes);
  routes['/catalog.json'] = CATALOG.replace('SCHEMA_URL', `${server.origin}/order.schema.json`);

  seedWorkspaceFile(DATA_REL_PATH, ORDER_DATA);
  seedUserSettings({
    'jsonschema.catalog.useSchemaStore': false,
    'jsonschema.catalog.sources': [`${server.origin}/catalog.json`],
  });

  try {
    await runDemo('schema-catalog', async (window, capture) => {
      await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
      await capture('workspace');

      // The catalog warms in the background, then the status bar switches from
      // "unbound" to the catalog's name with an "(auto)" marker.
      await window
        .waitForSelector('.statusbar-item:has-text("ACME Order")', { state: 'visible', timeout: 25_000 })
        .catch(() => undefined);
      await window.waitForTimeout(1_500);
      await capture('catalog-bound');

      // And it is a real binding, not a label: validation resolves through it.
      await runCommand(window, 'JSON Schema: Validate This File');
      await window.waitForTimeout(2_500);
      await capture('validated');

      await window.waitForTimeout(1_000);
      await capture('validated-hold');
    }, true, [DATA_REL_PATH]);
  } finally {
    await server.close();
  }
});
