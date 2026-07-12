import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';

/**
 * F20 — validate every bound file across the workspace. Binds both the valid
 * and invalid person fixtures to person.schema.json, runs the command from
 * the palette (its only entry point — no icon or status-bar affordance), and
 * shows the summary notification with its "Copy Report" action.
 */
test('demo-workspace-validation: validate every bound file across the workspace', () => {
  seedWorkspaceFile(
    '.vscode/settings.json',
    JSON.stringify(
      {
        'json.schemas': [
          {
            url: './schemas/person.schema.json',
            fileMatch: ['data/person-invalid.json', 'data/person-valid.json'],
          },
        ],
      },
      null,
      2,
    ),
  );

  return runDemo('workspace-validation', async (window, capture) => {
    await capture('workspace');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Validate Workspace', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(600);
    await capture('scan-progress');

    await window.waitForSelector('.notification-list-item .monaco-button:has-text("Copy Report")', {
      state: 'visible',
      timeout: 20_000,
    });
    await capture('scan-summary');

    await window.waitForTimeout(800);
    await capture('workspace-validation-hold');
  });
});
