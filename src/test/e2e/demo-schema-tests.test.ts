import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { openFile, runCommand } from './helpers/ui';

// A suite that pins what the schema must accept and must reject (F29). The
// failing case is deliberate: it is the whole point of the feature — a schema
// that has quietly started accepting garbage fails a test instead of reaching
// production. `total` is declared `integer`, so the string case must be
// rejected, and the last valid case violates the enum on purpose so the run
// ends on a located failure rather than an all-green wall of text.
const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["status", "total"],
  "properties": {
    "status": { "enum": ["open", "paid", "shipped"] },
    "total": { "type": "integer", "minimum": 0 }
  },
  "additionalProperties": false
}
`;

const ORDER_SUITE = `{
  "schema": "./order.schema.json",
  "description": "What an order document must and must not look like",
  "valid": [
    { "status": "open", "total": 0 },
    { "status": "paid", "total": 42 },
    { "name": "a refund", "instance": { "status": "refunded", "total": 7 } }
  ],
  "invalid": [
    { "name": "a total that is not a number", "instance": { "status": "open", "total": "42" }, "errors": ["type"] },
    { "name": "an unknown status", "instance": { "status": "cancelled", "total": 1 }, "errors": ["enum"] }
  ]
}
`;

const SUITE_REL_PATH = 'schemas/order.schema.test.json';

test('demo-schema-tests: run a schema test suite and see the failing case', () => {
  seedWorkspaceFile('schemas/order.schema.json', ORDER_SCHEMA);
  seedWorkspaceFile(SUITE_REL_PATH, ORDER_SUITE);

  return runDemo('schema-tests', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('workspace');

    await openFile(window, 'order.schema.test.json');
    await capture('suite-open');

    await runCommand(window, 'JSON Schema: Run Schema Tests');
    await window
      .waitForSelector('.notification-list-item', { state: 'visible', timeout: 20_000 })
      .catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('results');

    // The failing case is marked in the suite file itself, where it was
    // declared — that is the part worth showing.
    await window.keyboard.press('Control+Shift+m');
    await window.waitForTimeout(1_200);
    await capture('problems-panel');

    await window.waitForTimeout(800);
    await capture('problems-panel-hold');
  }, true, [SUITE_REL_PATH]);
});
