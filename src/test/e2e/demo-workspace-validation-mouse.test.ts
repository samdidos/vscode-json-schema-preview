import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, typeSlowly, clickSelector } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-workspace-validation. jsonschema.validateWorkspace
 * has no editor-title icon or status-bar entry — the Command Palette is its
 * only real entry point for any user, mouse-first or not — so this still
 * types the command, but with the animated cursor/typing for continuity, and
 * clicks the "Copy Report" action on the summary notification with the mouse.
 */
test('demo-workspace-validation-mouse: validate every bound file across the workspace', () => {
  // Bind both the valid and invalid person fixtures to person.schema.json at
  // WorkspaceFolder scope, so the scan has one passing and one failing file.
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

  return runDemo('workspace-validation-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
    await capture('command-palette');

    await typeSlowly(window, capture, 'JSON Schema: Validate Workspace', 'command-typed');
    await window.waitForTimeout(500);
    await capture('command-typed-done');

    await window.keyboard.press('Enter');
    // Progress notification, then the scan completes on its own.
    await window.waitForTimeout(600);
    await capture('scan-progress');

    await window.waitForSelector('.notification-list-item .monaco-button:has-text("Copy Report")', {
      state: 'visible',
      timeout: 20_000,
    });
    await capture('scan-summary');

    await clickSelector(
      window,
      capture,
      '.notification-list-item .monaco-button:has-text("Copy Report")',
      'copy-report',
    );

    await window.waitForTimeout(700);
    await capture('report-copied');

    await window.waitForTimeout(800);
    await capture('workspace-validation-hold');
  });
});
