import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, openFileVisible, ctrlClickSelector } from './helpers/mouse';

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
 * Mouse-driven twin of demo-ref-navigation — Ctrl-clicks the $ref value in
 * contact.schema.json, the standard VS Code go-to-definition gesture, and
 * shows address.schema.json opening at the referenced location.
 */
test('demo-ref-navigation-mouse: ctrl-click a $ref to jump to its target schema', () => {
  seedWorkspaceFile('schemas/address.schema.json', ADDRESS_SCHEMA);
  seedWorkspaceFile('schemas/contact.schema.json', CONTACT_SCHEMA);

  return runDemo('ref-navigation-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'contact.schema.json');

    // Target the specific token span rendering the ref text, not the whole
    // line — go-to-definition needs the click to land inside the $ref
    // string's own character range.
    await ctrlClickSelector(
      window,
      capture,
      '.view-line span:has-text("address.schema.json")',
      'goto-address',
    );

    // Confirm the target actually opened before capturing the "arrived" frame.
    await window.waitForSelector('.tab[aria-label*="address.schema.json"]', {
      state: 'visible',
      timeout: 15_000,
    });
    await window.waitForTimeout(500);
    await capture('address-schema-open');

    await window.waitForTimeout(800);
    await capture('address-schema-open-hold');
  });
});
