import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { openFile, runCommand } from './helpers/ui';

/**
 * F31 — the schema-aware Outline. The Explorer's Outline view is collapsed by
 * default, so this expands it and lets the schema's own shape (properties,
 * their types, whether they are required) render in place of the chain of
 * "properties" nodes VS Code's built-in JSON outline would show.
 *
 * `person.schema.json` ships in the showcase workspace and has nested objects,
 * an array, an enum and a $defs section — enough for the outline to be worth
 * looking at without seeding anything.
 */
test('demo-outline: read a schema through the Outline view', () =>
  runDemo('outline', async (window, capture) => {
    await capture('workspace');

    await openFile(window, 'person.schema.json');
    await capture('schema-open');

    // Focus the Outline view directly rather than hunting for its twisty: the
    // command is the same entry point a user reaches from the View menu, and
    // it works whether or not the section was already expanded.
    await runCommand(window, 'Focus on Outline View');
    await window
      .waitForSelector('.outline-tree .monaco-list-row, .pane[aria-label*="Outline"] .monaco-list-row', {
        state: 'visible',
        timeout: 15_000,
      })
      .catch(() => undefined);
    await window.waitForTimeout(1_200);
    await capture('outline');

    await window.waitForTimeout(1_000);
    await capture('outline-hold');
  }));
