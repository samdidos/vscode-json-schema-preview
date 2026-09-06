import { test } from '@playwright/test';
import { runDemo } from './helpers/demo';
import { seedWorkspaceFile } from './helpers/launch';
import { installCursor, clickSelector, typeSlowly } from './helpers/mouse';

// Same fixture as demo-refactoring — see that file for why `address` appears
// twice.
const CONTACT_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Contact",
  "type": "object",
  "properties": {
    "home": {
      "type": "object",
      "properties": {
        "city": { "type": "string" },
        "country": { "type": "string" }
      }
    },
    "work": {
      "type": "object",
      "properties": {
        "city": { "type": "string" },
        "country": { "type": "string" }
      }
    }
  }
}
`;

const SCHEMA_REL_PATH = 'schemas/contact.schema.json';

/**
 * Mouse-driven twin of demo-refactoring. Clicks into the subschema and opens
 * the lightbulb, which is how a reader actually meets these refactorings —
 * they have no toolbar icon, and the palette entries only make sense once you
 * already know they exist.
 *
 * The lightbulb is clicked rather than triggered with Ctrl+. because the glyph
 * appearing in the gutter is itself the discoverable part: it is the signal
 * that this position can be refactored at all (F30-FR-02 only offers actions
 * where they apply).
 */
test('demo-refactoring-mouse: extract a repeated subschema through the lightbulb', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, CONTACT_SCHEMA);

  return runDemo('refactoring-mouse', async (window, capture) => {
    await installCursor(window);
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
    await capture('schema-open');

    // Click inside the first "home" subschema.
    await clickSelector(window, capture, '.view-line:has-text("\\"home\\"")', 'cursor-in-subschema');
    await window.waitForTimeout(800);
    await capture('cursor-placed');

    // The lightbulb takes a moment to appear after the cursor settles.
    const bulb = window.locator('.codicon-lightbulb, .lightbulb-glyph').first();
    const bulbShown = await bulb.isVisible().catch(() => false);
    if (bulbShown) {
      await clickSelector(window, capture, '.codicon-lightbulb, .lightbulb-glyph', 'lightbulb');
    } else {
      // No glyph rendered (it is throttled and theme-dependent) — the keyboard
      // route opens the same menu, so the demo shows the actions either way
      // rather than stopping on a missing gutter icon.
      await window.keyboard.press('Control+.');
    }
    await window.waitForSelector('.action-widget, .monaco-list.action-widget', {
      state: 'visible',
      timeout: 10_000,
    }).catch(() => undefined);
    await window.waitForTimeout(1_000);
    await capture('refactor-menu');

    await clickSelector(
      window,
      capture,
      '.action-widget .monaco-list-row:has-text("Extract to $defs"), .monaco-list-row:has-text("Extract to $defs")',
      'pick-extract',
    ).catch(async () => { await window.keyboard.press('Enter'); });

    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await window.waitForTimeout(600);
    await typeSlowly(window, capture, 'address', 'name-typed');
    await window.waitForTimeout(400);
    await window.keyboard.press('Enter');

    await window.waitForTimeout(1_800);
    await capture('extracted');

    await window.waitForTimeout(1_000);
    await capture('extracted-hold');
  }, true, [SCHEMA_REL_PATH]);
});
