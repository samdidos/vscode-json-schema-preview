import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, clickStatusBarItem, clickSelector, typeSlowly } from './helpers/mouse';

// Same fixtures as demo-inline-binding — see that file for why the data file
// must start with no `$schema` line.
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

/**
 * Mouse-driven twin of demo-inline-binding. Enters through the status bar's
 * "Schema: unbound" item rather than the palette — the same door demo-binding
 * uses, and the one a reader is most likely to notice, since the bar is already
 * telling them the file has no schema.
 *
 * The file opens through VS Code's own launch args rather than Quick Open: it
 * is freshly seeded, so its search-index visibility isn't something to depend
 * on (the failure demo-quickfix-mouse documents).
 */
test('demo-inline-binding-mouse: write the binding into the file through its $schema field', () => {
  seedWorkspaceFile('schemas/order.schema.json', ORDER_SCHEMA);
  seedWorkspaceFile(DATA_REL_PATH, ORDER_DATA);

  return runDemo('inline-binding-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('workspace');

    await clickStatusBarItem(window, capture, 'Schema:', 'binding-statusbar');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(700);
    await capture('schema-picker');

    await typeSlowly(window, capture, 'order.schema.json', 'schema-filter');
    await window.waitForTimeout(400);
    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("order.schema.json")',
      'pick-schema',
    );

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(700);
    await capture('scope-picker');

    // "Inline (this file)" is the whole point: the reference is written into
    // the document, not into workspace settings.
    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("Inline")',
      'pick-inline-scope',
    );
    await window.waitForTimeout(1_800);
    await capture('schema-written');

    await window.waitForTimeout(900);
    await capture('schema-written-hold');
  }, true, [DATA_REL_PATH]);
});
