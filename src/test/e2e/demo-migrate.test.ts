import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { runCommand } from './helpers/ui';

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

const SCHEMA_REL_PATH = 'schemas/legacy.schema.json';

/**
 * Command-palette twin of demo-migrate-mouse (no animated cursor). Runs the
 * migrate command and picks the target draft from the follow-up picker. This
 * variant is the CI UI-smoke signal (S08-SR-10); its frames are not used for
 * GIFs.
 *
 * The schema opens via VS Code's own launch args (see runDemo's `openFiles`)
 * rather than driving Quick Open (Ctrl+P): this file was one of two demos
 * whose Quick Open row-wait reproducibly timed out on real CI runs (both the
 * ubuntu-hosted smoke job and the separate mouse/GIF job, on independent
 * runner VMs) — a real, repeatable issue with Quick Open's async
 * file-search for this fixture, not environmental flakiness. Pre-opening via
 * CLI args sidesteps that code path entirely.
 */
test('demo-migrate: migrate a schema to a newer draft', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, LEGACY_SCHEMA);

  return runDemo('draft-migration', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    // runCommand runs the command, which opens the draft picker.
    await runCommand(window, 'JSON Schema: Migrate to Draft');
    await window.waitForSelector('.quick-input-list .monaco-list-row', { state: 'visible', timeout: 10_000 });
    await capture('draft-picker');

    await window.keyboard.press('Enter'); // pick the first draft (2020-12)
    await window.waitForTimeout(2_000);
    await capture('migrated');
  }, true, [SCHEMA_REL_PATH]);
});
