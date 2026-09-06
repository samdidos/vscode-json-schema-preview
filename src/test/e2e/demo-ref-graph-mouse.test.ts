import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, clickEditorOverflowAction } from './helpers/mouse';

// Same fixture as demo-ref-graph — see that file for why every $ref is
// internal.
const ORG_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Organisation",
  "type": "object",
  "required": ["name", "owner"],
  "properties": {
    "name": { "type": "string" },
    "owner": { "$ref": "#/$defs/person" },
    "members": { "type": "array", "items": { "$ref": "#/$defs/person" } },
    "billing": { "$ref": "#/$defs/address" }
  },
  "$defs": {
    "person": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string" },
        "home": { "$ref": "#/$defs/address" },
        "manager": { "$ref": "#/$defs/person" }
      }
    },
    "address": {
      "type": "object",
      "properties": {
        "city": { "type": "string" },
        "country": { "$ref": "#/$defs/country" }
      }
    },
    "country": { "type": "string", "pattern": "^[A-Z]{2}$" }
  }
}
`;

const SCHEMA_REL_PATH = 'schemas/organisation.schema.json';

/**
 * Mouse-driven twin of demo-ref-graph. The graph command has no icon of its
 * own — it lives in the editor-title overflow under the "JSON Schema" submenu —
 * so this opens it the way a reader browsing the toolbar would find it.
 */
test('demo-ref-graph-mouse: open the $ref graph from the editor toolbar', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORG_SCHEMA);

  return runDemo('ref-graph-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    await clickEditorOverflowAction(window, capture, 'View $ref Dependency Graph', 'ref-graph');

    await window.waitForSelector('iframe.webview.ready', { state: 'visible', timeout: 25_000 });
    await window.waitForTimeout(2_200);
    await capture('graph');

    await window.waitForTimeout(1_200);
    await capture('graph-hold');
  }, true, [SCHEMA_REL_PATH]);
});
