import { test } from '@playwright/test';
import { runDemoWithBuiltins } from './helpers/demo';
import { seedWorkspaceFile, seedGitBaseline } from './helpers/launch';

// Committed as-is, then edited on camera. The CodeLens reads Git HEAD, so the
// verdict starts at "Backward-compatible" and has somewhere to move to.
const ORDER_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "integer" },
    "status": { "enum": ["open", "paid", "shipped", "refunded"] }
  }
}
`;

const SCHEMA_REL_PATH = 'schemas/order.schema.json';

// The lens is debounced (F26-FR-08 never blocks typing) and computed off the
// git extension, so both the first verdict and the flip need real time.
const LENS = '.codelens-decoration a, .codelens-decoration';

test('demo-compat-verdict: watch the compatibility verdict flip as the schema changes', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORDER_SCHEMA);
  seedGitBaseline();

  return runDemoWithBuiltins('compat-verdict', async (window, capture) => {
    await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });

    // FATAL, not guarded. The first run of this demo "passed" with the lens
    // wait wrapped in .catch() — meaning it would have shipped a GIF of a
    // feature that never rendered, which is exactly the silent failure
    // S08-SR-19 exists to catch. If the lens is not there, the demo is worth
    // nothing and must say so.
    const expectLens = async (moment: string): Promise<void> => {
      try {
        await window.waitForSelector(LENS, { state: 'visible', timeout: 30_000 });
      } catch {
        throw new Error(
          `The compatibility CodeLens is not on screen at "${moment}". This ` +
          'demo is about that lens, so a capture without it shows nothing ' +
          '(S08-SR-19). Most likely the workspace is not a git repository the ' +
          'built-in vscode.git extension can see — the lens reads Git HEAD ' +
          'through it, and renders nothing at all when there is no baseline.',
        );
      }
    };

    // The starting verdict: unchanged from HEAD, so compatible.
    await expectLens('the unchanged schema');
    await window.waitForTimeout(1_200);
    await capture('verdict-compatible');

    // Add a required property — every document that omits it stops validating.
    await window.keyboard.press('Control+g');
    await window.waitForTimeout(300);
    await window.keyboard.type('5', { delay: 40 });
    await window.keyboard.press('Enter');
    await window.keyboard.press('Home');
    await window.keyboard.press('Shift+End');
    await window.keyboard.type('  "required": ["id", "status"],', { delay: 55 });
    await window.waitForTimeout(600);
    await capture('edited');

    // The lens recomputes on its own, without a save.
    await window.waitForTimeout(3_500);
    await expectLens('after the breaking edit');
    await capture('verdict-breaking');

    await window.waitForTimeout(1_200);
    await capture('verdict-breaking-hold');
  }, [SCHEMA_REL_PATH]);
});
