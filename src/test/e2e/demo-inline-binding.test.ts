import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { runCommand } from './helpers/ui';

// A schema and a data file that does not reference it. The point of F10 is the
// `$schema` line that is *not* there yet, so the fixture must start without one
// — person-valid.json ships bound-by-settings in other demos, and reusing it
// would demonstrate nothing.
const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["id", "status"],
  "properties": {
    "id": { "type": "integer", "minimum": 1 },
    "status": { "enum": ["open", "paid", "shipped"] },
    "total": { "type": "number", "minimum": 0 }
  }
}
`;

const ORDER_DATA = `{
  "id": 1041,
  "status": "paid",
  "total": 79.5
}
`;

const DATA_REL_PATH = 'data/order.json';

test('demo-inline-binding: bind a data file to a schema through its own $schema field', () => {
  seedWorkspaceFile('schemas/order.schema.json', ORDER_SCHEMA);
  seedWorkspaceFile(DATA_REL_PATH, ORDER_DATA);

  return runDemo('inline-binding', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('workspace');

    await runCommand(window, 'JSON Schema: Bind Schema');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(800);
    await capture('schema-picker');

    await window.keyboard.type('order.schema.json', { delay: 40 });
    await window.waitForSelector(
      '.quick-input-list .monaco-list-row:has-text("order.schema.json")',
      { state: 'visible', timeout: 10_000 },
    );
    await window.waitForTimeout(400);
    await window.keyboard.press('Enter');

    // The scope pick is the step that distinguishes F10 from F04: "Inline"
    // writes the reference into the document itself, so the file carries its
    // own binding anywhere it is opened, with no workspace settings involved.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(800);
    await capture('scope-picker');

    await window.waitForSelector(
      '.quick-input-list .monaco-list-row:has-text("Inline")',
      { state: 'visible', timeout: 10_000 },
    );
    await window.keyboard.press('Enter');
    await window.waitForTimeout(1_500);

    // The `$schema` line is now the first line of the data file.
    await capture('schema-written');
    await window.waitForTimeout(1_000);
    await capture('schema-written-hold');
  }, true, [DATA_REL_PATH]);
});
