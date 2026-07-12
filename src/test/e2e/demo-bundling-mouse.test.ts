import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, openFileVisible, clickEditorOverflowAction, clickSelector } from './helpers/mouse';

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
 * Mouse-driven twin of demo-bundling — Bundle / Dereference lives in the
 * editor-title "⋯" overflow group (`1_run`). Bundles contact.schema.json,
 * which $refs a sibling address.schema.json, so the result visibly inlines
 * the referenced schema into $defs.
 */
test('demo-bundling-mouse: bundle a schema with an external $ref into $defs', () => {
  seedWorkspaceFile('schemas/address.schema.json', ADDRESS_SCHEMA);
  seedWorkspaceFile('schemas/contact.schema.json', CONTACT_SCHEMA);

  return runDemo('bundling-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'contact.schema.json');

    await clickEditorOverflowAction(window, capture, 'Bundle / Dereference Schema', 'bundle');

    // Mode picker — "Bundle (refs → $defs)" is the first item; click it.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('mode-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'mode-pick');

    await window.waitForTimeout(3_000);
    await capture('bundled-schema');

    await window.waitForTimeout(800);
    await capture('bundled-schema-hold');
  });
});
