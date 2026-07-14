import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { openFile, runCommand } from './helpers/ui';

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
 * Command-palette twin of demo-migrate-mouse (no animated cursor). Runs the
 * migrate command and picks the target draft from the follow-up picker. This
 * variant is the CI UI-smoke signal (S08-SR-10); its frames are not used for
 * GIFs.
 */
test('demo-migrate: migrate a schema to a newer draft', () => {
  seedWorkspaceFile('schemas/legacy.schema.json', LEGACY_SCHEMA);

  return runDemo('draft-migration', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'legacy.schema.json');
    await capture('schema-open');

    // runCommand runs the command, which opens the draft picker.
    await runCommand(window, 'JSON Schema: Migrate to Draft');
    await window.waitForSelector('.quick-input-list .monaco-list-row', { state: 'visible', timeout: 10_000 });
    await capture('draft-picker');

    await window.keyboard.press('Enter'); // pick the first draft (2020-12)
    await window.waitForTimeout(2_000);
    await capture('migrated');
  });
});
