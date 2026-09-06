import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { runCommand } from './helpers/ui';

// Every `$ref` here is internal (`#/$defs/...`). That is deliberate: F24-FR-08
// makes the command *ask* before resolving relative or remote references over
// the network, so a fixture with external refs would stop the demo on a
// yes/no prompt — and S08-NFR-02 forbids the fetch that answering "Resolve"
// would start. Internal refs also make the graph legible at a glance, which is
// what the panel is for.
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

test('demo-ref-graph: see how a schema references itself', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORG_SCHEMA);

  return runDemo('ref-graph', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    await runCommand(window, 'JSON Schema: View $ref Dependency Graph');
    await window.waitForSelector('iframe.webview.ready', { state: 'visible', timeout: 25_000 });
    await window.waitForTimeout(2_000);
    await capture('graph');

    await window.waitForTimeout(1_200);
    await capture('graph-hold');
  }, true, [SCHEMA_REL_PATH]);
});
