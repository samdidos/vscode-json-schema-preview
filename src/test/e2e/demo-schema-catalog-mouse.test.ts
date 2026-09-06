import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile, seedUserSettings } from './helpers/launch';
import { startFixtureHttpServer } from './helpers/fixtureServer';
import { installCursor, clickEditorAction } from './helpers/mouse';

// Same fixtures as demo-schema-catalog — see that file for why the catalog is
// served locally and SchemaStore is switched off.
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

// Deliberately invalid: `status` is not one of the enum values. A catalog
// binding that produces no diagnostics looks the same as no binding at all, so
// the demo needs the schema to visibly do work.
const ORDER_DATA = `{
  "id": 4102,
  "status": "refunded"
}
`;

const DATA_REL_PATH = 'data/acme.order.json';

/**
 * Mouse-driven twin of demo-schema-catalog. There is no command to click for
 * the binding itself — that is the feature — so the recording watches the
 * status bar resolve on its own, then clicks Validate to prove the catalog's
 * schema is really in force.
 */
test('demo-schema-catalog-mouse: a catalog binds by file name, and the schema does real work', async () => {
  const routes: Record<string, string> = { '/order.schema.json': ORDER_SCHEMA };
  const server = await startFixtureHttpServer(routes);
  routes['/catalog.json'] = CATALOG.replace('SCHEMA_URL', `${server.origin}/order.schema.json`);

  seedWorkspaceFile(DATA_REL_PATH, ORDER_DATA);
  seedUserSettings({
    'jsonschema.catalog.useSchemaStore': false,
    'jsonschema.catalog.sources': [`${server.origin}/catalog.json`],
  });

  try {
    await runDemo('schema-catalog-mouse', async (window, capture) => {
      await installCursor(window);
      await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
      await capture('workspace');

      await window
        .waitForSelector('.statusbar-item:has-text("ACME Order")', { state: 'visible', timeout: 25_000 })
        .catch(() => undefined);
      await window.waitForTimeout(1_500);
      await capture('catalog-bound');

      await clickEditorAction(window, capture, 'Validate This File', 'validate');
      await window.waitForTimeout(2_500);
      await capture('validated');

      await window.keyboard.press('Control+Shift+m');
      await window.waitForTimeout(1_200);
      await capture('problems-panel');

      await window.waitForTimeout(900);
      await capture('problems-panel-hold');
    }, true, [DATA_REL_PATH]);
  } finally {
    await server.close();
  }
});
