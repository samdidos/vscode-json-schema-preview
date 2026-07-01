import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, openFileVisible, clickStatusBarItem } from './helpers/mouse';

const AUTH_HOST = 'schemas.acme.dev';

/**
 * Mouse-driven twin of demo-schema-auth: opens a data file that references a
 * remote schema (so the auth indicator appears in the bottom bar), then clicks
 * the $(unlock) status-bar item to launch the Configure Schema Authentication
 * flow — no command palette involved.
 */
test('demo-schema-auth-mouse: click the status-bar lock indicator to configure auth', () => {
  // Ship a fixture carrying a remote $schema so the auth status-bar item shows.
  seedWorkspaceFile(
    'data/remote-person.json',
    JSON.stringify(
      {
        $schema: `https://${AUTH_HOST}/person.schema.json`,
        id: 1,
        name: 'Alice Wonderland',
      },
      null,
      2,
    ),
  );

  return runDemo('schema-auth-mouse', async (window, capture) => {
    await installCursor(window);
    await capture('workspace');

    await openFileVisible(window, capture, 'remote-person.json');
    // Wait for the actual condition rather than a fixed sleep: SchemaAuthStatusBar's
    // update() is async, so the "$(unlock) schemas.acme.dev" text can take longer
    // than a short fixed delay to render under CI load — this was an occasional
    // source of flakiness in clickStatusBarItem below.
    await window.waitForSelector(`.statusbar-item:has-text("${AUTH_HOST}")`, {
      state: 'visible',
      timeout: 20_000,
    });
    await capture('auth-status-bar');

    // Click the unlock indicator to launch the auth configuration flow.
    await clickStatusBarItem(window, capture, AUTH_HOST, 'auth-statusbar');
    await window.waitForTimeout(2_000);
    await capture('auth-config-prompt');

    // Dismiss — we're capturing the UI shape, not running a real auth flow.
    await window.keyboard.press('Escape');
    await window.waitForTimeout(500);
    await capture('auth-dismissed');

    await window.waitForTimeout(700);
    await capture('schema-auth-hold');
  });
});
