import { test } from '@playwright/test';
import { runDemoWithBuiltins } from './helpers/demo';
import { seedWorkspaceFile, seedGitBaseline } from './helpers/launch';
import { installCursor, clickSelector, typeSlowly } from './helpers/mouse';

// Same fixture as demo-compat-verdict.
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
const LENS = '.codelens-decoration a, .codelens-decoration';

/**
 * Mouse-driven twin of demo-compat-verdict. This one is deliberately not about
 * clicking a command: the CodeLens is *ambient*, sitting above line 1 and
 * updating while you type, and the demo's job is to show that it answers "can I
 * ship this?" without being asked. The only click is on the lens itself at the
 * end, which opens the full diff report behind the verdict.
 */
test('demo-compat-verdict-mouse: type a breaking change and watch the verdict flip', () => {
  seedWorkspaceFile(SCHEMA_REL_PATH, ORDER_SCHEMA);
  seedGitBaseline();

  return runDemoWithBuiltins('compat-verdict-mouse', async (window, capture) => {
    await installCursor(window);
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

    await expectLens('the unchanged schema');
    await window.waitForTimeout(1_200);
    await capture('verdict-compatible');

    await clickSelector(window, capture, '.view-line:has-text("required")', 'click-required');
    await window.keyboard.press('Home');
    await window.keyboard.press('Shift+End');
    await window.waitForTimeout(300);
    await typeSlowly(window, capture, '  "required": ["id", "status"],', 'edit-required', 55);
    await window.waitForTimeout(600);
    await capture('edited');

    await window.waitForTimeout(3_500);
    await expectLens('after the breaking edit');
    await capture('verdict-breaking');

    // The lens is a link: it runs Diff Against Baseline, which asks which
    // baseline first — so "what broke?" is one click and one pick away from
    // the verdict, not a separate errand.
    await clickSelector(window, capture, LENS, 'open-report').catch(() => undefined);
    await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await window.waitForTimeout(700);
    await capture('baseline-picker');

    await clickSelector(
      window,
      capture,
      '.quick-input-list .monaco-list-row:has-text("Git HEAD")',
      'pick-git-head',
    ).catch(() => undefined);
    await window.waitForTimeout(2_200);
    await capture('report');

    await window.waitForTimeout(1_000);
    await capture('report-hold');
  }, [SCHEMA_REL_PATH]);
});
