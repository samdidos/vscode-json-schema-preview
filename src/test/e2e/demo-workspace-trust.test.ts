import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile, clickFirstMatch } from './helpers/ui';

/**
 * Demonstrates the Workspace Trust gate: in restricted mode the preview command
 * shows a warning instead of running the Python tool.
 */
test('demo-workspace-trust: preview is blocked in untrusted workspaces', () =>
  runDemo('workspace-trust', async (window, capture) => {
    // VS Code shows a Workspace Trust modal — capture it
    await capture('trust-dialog');

    // Click "No, I don't trust the authors" to stay in Restricted Mode.
    // Selector text varies across VS Code versions; try the most common variants.
    const clicked = await clickFirstMatch(window, [
      '[title*="Restricted Mode"]',
      'text=Don\'t Trust',
      'text=Browse Folder in Restricted Mode',
      '.monaco-button:has-text("No")',
    ]);
    if (!clicked) {
      // Fall back: dismiss the dialog and VS Code usually stays restricted
      await window.keyboard.press('Escape');
    }

    await window.waitForTimeout(1_500);
    await capture('restricted-mode-active');

    // Open a schema file and try to run the preview command
    await openFile(window, 'person.schema.json');
    await capture('schema-open-restricted');

    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await window.keyboard.type('JSON Schema: Preview', { delay: 40 });
    await window.waitForTimeout(600);
    await window.keyboard.press('Enter');
    await window.waitForTimeout(2_500);

    // Extension shows: "JSON Schema Preview runs a local Python tool… disabled in untrusted workspaces."
    await capture('trust-warning-shown');

    await window.waitForTimeout(800);
    await capture('trust-warning-hold');
  }, false /* untrusted */));
