import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { runCommand } from './helpers/ui';

// A data file that exercises only three of person.schema.json's nine
// properties. That gap is the feature: F23 reports which parts of a schema the
// real data never touches, so a reader can tell what is dead weight and what is
// simply untested. person-valid.json fills in nearly everything, which would
// make for a report saying nothing.
//
// The `$schema` reference is what binds it (F10) — no workspace settings
// involved, so the demo does not depend on binding state left by anything else.
const SPARSE_DATA = `{
  "$schema": "../schemas/person.schema.json",
  "id": 7,
  "name": "Bob Baker",
  "email": "bob@example.com"
}
`;

const DATA_REL_PATH = 'data/person-sparse.json';

test('demo-schema-coverage: report which schema properties the data never uses', () => {
  seedWorkspaceFile(DATA_REL_PATH, SPARSE_DATA);

  return runDemo('schema-coverage', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('workspace');

    await runCommand(window, 'JSON Schema: Report Schema Coverage from Data');

    // The report arrives as a notification with a Copy-report action, and the
    // unexercised properties are marked on the schema file itself.
    await window
      .waitForSelector('.notification-list-item', { state: 'visible', timeout: 20_000 })
      .catch(() => undefined);
    await window.waitForTimeout(1_500);
    await capture('coverage-report');

    await window.keyboard.press('Control+Shift+m');
    await window.waitForTimeout(1_200);
    await capture('problems-panel');

    await window.waitForTimeout(900);
    await capture('problems-panel-hold');
  }, true, [DATA_REL_PATH]);
});
