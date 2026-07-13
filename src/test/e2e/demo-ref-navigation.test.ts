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
 * F13 — $ref go-to-definition. Opens contact.schema.json (which $refs a
 * sibling address.schema.json), jumps the cursor to the $ref line (line 9),
 * and runs Go to Definition (F12) to show address.schema.json opening at the
 * referenced location.
 */
test('demo-ref-navigation: go to definition on a $ref jumps to its target schema', () => {
  seedWorkspaceFile('schemas/address.schema.json', ADDRESS_SCHEMA);
  seedWorkspaceFile('schemas/contact.schema.json', CONTACT_SCHEMA);

  return runDemo('ref-navigation', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'contact.schema.json');
    await capture('schema-file-open');

    // Line 9 is `      "$ref": "./address.schema.json"`. End lands the cursor
    // right after the closing quote — outside the $ref string's own offset
    // range (go-to-definition's offset check excludes that exact boundary,
    // see findRefInJsonTree/findNodeAtOffset) — so step one character back
    // in from there to land inside the string.
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('9', { delay: 60 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowLeft');
    await capture('cursor-on-ref');

    await window.keyboard.press('F12');

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
