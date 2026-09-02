import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { openFile } from './helpers/ui';

// Same seeded binding as the mouse twin (S08-SR-19): person-invalid.json ships
// unbound so demo-showcase can bind it on camera, which left this demo ending
// on the "No schema bound" refusal instead of on validation errors.
test('demo-validation: validate an invalid JSON file against its schema', () => {
  seedWorkspaceFile(
    '.vscode/settings.json',
    JSON.stringify(
      {
        'json.schemas': [
          { url: './schemas/person.schema.json', fileMatch: ['data/person-invalid.json'] },
        ],
      },
      null,
      2,
    ),
  );

  return runDemo('validation', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'person-invalid.json');
    await capture('invalid-file-open');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Validate This File', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window
      .waitForSelector('.notification-list-item', { state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('validation-result');

    await window.waitForTimeout(800);
    await capture('validation-result-hold');
  });
});
