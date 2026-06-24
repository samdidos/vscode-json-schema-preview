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
 */
export async function runDemo(
  name: string,
  fn: (window: Page, capture: CaptureFunction) => Promise<void>,
  trusted = true,
): Promise<void> {
  const { app, window } = await (trusted ? launchVSCode() : launchVSCodeUntrusted());
  const capture = captureSequence(window, name);
  try {
    await fn(window, capture);
  } finally {
    await app.close();
  }
}
