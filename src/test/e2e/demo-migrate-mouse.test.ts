import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, openFileVisible, clickEditorOverflowAction, clickSelector } from './helpers/mouse';

// A draft-07 schema using the legacy `definitions` container and local `$ref`s,
// so migrating to 2020-12 visibly rewrites definitions → $defs and the $refs.
const LEGACY_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Invoice",
  "type": "object",
  "definitions": {
    "Money": { "type": "integer", "minimum": 0 }
  },
  "properties": {
    "subtotal": { "$ref": "#/definitions/Money" },
    "tax": { "$ref": "#/definitions/Money" }
  }
}
`;

/**
 * Mouse-driven demo of F22 draft migration: open a draft-07 schema, run
 * "Migrate to Draft…" from the editor-title overflow menu (the 1_run group,
 * like Generate Types), pick 2020-12, and see the migrated schema open beside
 * the source.
 */
test('demo-migrate-mouse: migrate a schema to a newer draft from the editor toolbar', () => {
  seedWorkspaceFile('schemas/legacy.schema.json', LEGACY_SCHEMA);

  return runDemo('draft-migration-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'legacy.schema.json');

    await clickEditorOverflowAction(window, capture, 'Migrate to Draft', 'migrate');

    // Draft picker — 2020-12 is the first item.
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await window.waitForTimeout(500);
    await capture('draft-picker');
    await clickSelector(window, capture, '.quick-input-list .monaco-list-row', 'draft-pick');

    await window.waitForTimeout(2_000);
    await capture('migrated');

    await window.waitForTimeout(800);
    await capture('migrated-hold');
  });
});
