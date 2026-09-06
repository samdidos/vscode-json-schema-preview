import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';

// `address` is spelled out inline in two places. That repetition is the setup:
// Extract to $defs turns the first one into a definition and the second into a
// `$ref` to it, which is the whole argument for the refactoring — one place to
// change instead of two, with no change to which documents validate.
//
// Kept small on purpose: the extraction has to be readable in a GIF, and a
// 90-line fixture would put the two copies off screen at once.
const CONTACT_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Contact",
  "type": "object",
  "properties": {
    "home": {
      "type": "object",
      "properties": {
        "city": { "type": "string" },
        "country": { "type": "string" }
      }
    },
    "work": {
      "type": "object",
      "properties": {
        "city": { "type": "string" },
        "country": { "type": "string" }
      }
    }
  }
}
`;

const SCHEMA_REL_PATH = 'schemas/contact.schema.json';

test('demo-refactoring: extract a repeated inline object into $defs', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, CONTACT_SCHEMA);

  return runDemo('refactoring', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    // Put the cursor inside the first "home" object — line 7 is its `"type":
    // "object"`, which is inside the subschema the refactoring will lift out.
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('7', { delay: 40 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('End');
    await window.waitForTimeout(600);
    await capture('cursor-placed');

    // The refactor code actions are offered where they apply (F30-FR-02).
    await window.keyboard.press('Control+.');
    await window.waitForSelector('.action-widget, .monaco-list.action-widget', {
      state: 'visible',
      timeout: 10_000,
    }).catch(() => undefined);
    await window.waitForTimeout(1_000);
    await capture('refactor-menu');

    await window.keyboard.press('Enter');
    // Extract asks for the definition name via an input box.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await window.waitForTimeout(600);
    await window.keyboard.type('address', { delay: 70 });
    await window.waitForTimeout(400);
    await capture('name-typed');
    await window.keyboard.press('Enter');

    await window.waitForTimeout(1_800);
    await capture('extracted');

    await window.waitForTimeout(1_000);
    await capture('extracted-hold');
  }, true, [SCHEMA_REL_PATH]);
});
