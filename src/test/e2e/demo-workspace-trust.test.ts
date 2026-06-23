import { test } from '@playwright/test';
import { launchVSCodeUntrusted } from './helpers/launch';
import { openFile } from './helpers/ui';
import { captureSequence } from './helpers/capture';

/**
 * Demonstrates the Workspace Trust gate: in restricted mode the preview command
 * shows a warning instead of running the Python tool.
 */
test('demo-workspace-trust: preview is blocked in untrusted workspaces', async () => {
  const { app, window } = await launchVSCodeUntrusted();
  const capture = captureSequence(window, 'workspace-trust');

  try {
    // VS Code shows a Workspace Trust modal — capture it
    await capture('trust-dialog');

    // Click "No, I don't trust the authors" to stay in Restricted Mode.
    // Selector text varies across VS Code versions; try the most common variants.
    const dontTrust =
      (await window.$('[title*="Restricted Mode"]')) ??
      (await window.$('text=Don\'t Trust')) ??
      (await window.$('text=Browse Folder in Restricted Mode')) ??
      (await window.$('.monaco-button:has-text("No")'));

    if (dontTrust) {
      await dontTrust.click();
    } else {
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
  } finally {
    await app.close();
  }
});
