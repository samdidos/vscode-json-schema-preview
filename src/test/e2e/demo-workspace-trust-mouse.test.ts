import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { installCursor, openFileVisible, clickEditorAction, clickAt } from './helpers/mouse';

/**
 * Mouse-driven twin of demo-workspace-trust: the trust dialog is dismissed with
 * a click, then the (blocked) preview is launched from the editor-title icon.
 */
test('demo-workspace-trust-mouse: preview icon is blocked in untrusted workspaces', () =>
  runDemo(
    'workspace-trust-mouse',
    async (window, capture) => {
      await installCursor(window);
      // VS Code shows a Workspace Trust modal — capture it.
      await capture('trust-dialog');

      // Click "No, I don't trust the authors" / restricted-mode button.
      const trustButton = window
        .locator(
          [
            '[title*="Restricted Mode"]',
            '.monaco-button:has-text("Don\'t Trust")',
            '.monaco-button:has-text("Browse Folder in Restricted Mode")',
            '.monaco-button:has-text("No")',
          ].join(', '),
        )
        .first();

      try {
        await trustButton.waitFor({ state: 'visible', timeout: 5_000 });
        const box = await trustButton.boundingBox();
        if (box) {
          await clickAt(window, capture, box.x + box.width / 2, box.y + box.height / 2, 'dont-trust');
        }
      } catch {
        await window.keyboard.press('Escape');
      }

      await window.waitForTimeout(1_500);
      await capture('restricted-mode-active');

      await openFileVisible(window, capture, 'person.schema.json');

      // Click the Preview icon — the extension shows a restricted-mode warning.
      try {
        await clickEditorAction(window, capture, 'JSON Schema: Preview', 'preview-icon');
      } catch {
        // The icon may not render in restricted mode on some VS Code builds;
        // fall back to the command palette so the warning is still demonstrated.
        await window.keyboard.press('Control+Shift+p');
        await window.waitForSelector('.quick-input-widget', { state: 'visible' });
        await window.keyboard.type('JSON Schema: Preview', { delay: 40 });
        await window.waitForTimeout(600);
        await window.keyboard.press('Enter');
      }
      await window.waitForTimeout(2_500);
      await capture('trust-warning-shown');

      await window.waitForTimeout(800);
      await capture('trust-warning-hold');
    },
    false /* untrusted */,
  ));
