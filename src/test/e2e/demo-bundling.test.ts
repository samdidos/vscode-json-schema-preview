import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { openFile } from './helpers/ui';

const ADDRESS_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Address",
  "type": "object",
  "required": ["street", "city"],
  "properties": {
    "street": { "type": "string" },
    "city": { "type": "string" },
    "zip": { "type": "string" }
  }
}
`;

const CONTACT_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Contact",
  "type": "object",
  "required": ["name", "address"],
  "properties": {
    "name": { "type": "string" },
    "address": {
      "$ref": "./address.schema.json"
    }
  }
}
`;

/**
 * F14 — Bundle a schema, flattening an external $ref into $defs. Opens
 * contact.schema.json (which $refs a sibling address.schema.json), runs the
 * command from the palette, and accepts the "Bundle" mode.
 */
test('demo-bundling: bundle a schema with an external $ref into $defs', () => {
  seedWorkspaceFile('schemas/address.schema.json', ADDRESS_SCHEMA);
  seedWorkspaceFile('schemas/contact.schema.json', CONTACT_SCHEMA);

  return runDemo('bundling', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'contact.schema.json');
    await capture('schema-file-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Bundle / Dereference Schema', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    // Mode picker — "Bundle (refs → $defs)" is the first/default item; accept it.
    await window.waitForTimeout(800);
    await capture('mode-picker');
    await window.keyboard.press('Enter');

    await window.waitForTimeout(3_000);
    await capture('bundled-schema');

    await window.waitForTimeout(800);
    await capture('bundled-schema-hold');
  });
});
