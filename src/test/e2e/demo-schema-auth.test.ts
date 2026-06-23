import { test } from '@playwright/test';
import { launchVSCode } from './helpers/launch';
import { openFile } from './helpers/ui';
import { captureSequence } from './helpers/capture';

/**
 * Demonstrates the schema authentication flow: running "Configure Schema
 * Authentication…" surfaces the auth-provider Quick Pick and the cache-locally
 * workflow that eliminates IntelliSense red squiggles for private schemas.
 */
test('demo-schema-auth: configure auth for a remote schema', async () => {
  const { app, window } = await launchVSCode();
  const capture = captureSequence(window, 'schema-auth');

  try {
    await capture('workspace');

    // Open the person schema (any file activates the extension)
    await openFile(window, 'person.schema.json');
    await capture('schema-open');

    // Open the command palette and search for Configure Schema Authentication
    await window.keyboard.press('Control+Shift+p');
    await window.waitForSelector('.quick-input-widget', { state: 'visible' });
    await capture('command-palette');

    await window.keyboard.type('JSON Schema: Configure Schema Authentication', { delay: 40 });
    await window.waitForTimeout(600);
    await capture('command-typed');

    await window.keyboard.press('Enter');
    await window.waitForTimeout(2_000);
    // Extension prompts for a URL because the current file has no remote $schema
    await capture('auth-url-prompt');

    // Dismiss the prompt — we're capturing the UI shape, not running an auth flow
    await window.keyboard.press('Escape');
    await window.waitForTimeout(500);

    // Show the status bar auth indicator (lock icon) in the bottom bar
    await capture('auth-status-bar');

    await window.waitForTimeout(500);
    await capture('schema-auth-hold');
  } finally {
    await app.close();
  }
});
