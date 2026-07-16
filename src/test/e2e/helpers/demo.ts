import { Page } from 'playwright';
import { launchVSCode, launchVSCodeUntrusted } from './launch';
import { captureSequence } from './capture';

export type CaptureFunction = (label: string) => Promise<void>;

/**
 * Runs a demo scenario: launches VS Code, creates a capture sequence, and
 * guarantees the app is closed even if the test throws.
 *
 * @param name      Demo name (used for the screenshot directory and DEMOS list).
 * @param fn        Test body receives the window and a capture function.
 * @param trusted   Pass false to launch without --disable-workspace-trust.
 * @param openFiles Workspace-relative paths to open as active editor tabs at
 *                  launch, bypassing Quick Open (Ctrl+P) — useful for a
 *                  freshly-seeded file whose search-index visibility a demo
 *                  can't otherwise depend on.
 */
export async function runDemo(
  name: string,
  fn: (window: Page, capture: CaptureFunction) => Promise<void>,
  trusted = true,
  openFiles: string[] = [],
): Promise<void> {
  const { app, window } = await (trusted ? launchVSCode(openFiles) : launchVSCodeUntrusted(openFiles));
  const capture = captureSequence(window, name);
  try {
    await fn(window, capture);
  } finally {
    await app.close();
  }
}
