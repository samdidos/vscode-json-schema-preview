import { Page } from 'playwright';
import { ElectronApplication } from 'playwright';
import { launchVSCode, launchVSCodeUntrusted } from './launch';
import { captureSequence } from './capture';

export type CaptureFunction = (label: string) => Promise<void>;

/**
 * The launch a demo body is running against.
 *
 * `app` and `workspaceDir` exist for the two things a demo cannot do through
 * the page alone: stub Electron's native dialogs (`app.evaluate`), and point
 * that stub — or a fixture URL — at a real path inside *this* launch's
 * throwaway workspace copy. Most demos need neither and take only the first
 * two parameters.
 */
export interface DemoContext {
  app: ElectronApplication;
  workspaceDir: string;
}

/**
 * Runs a demo scenario: launches VS Code, creates a capture sequence, and
 * guarantees the app is closed even if the test throws.
 *
 * @param name      Demo name (used for the screenshot directory and DEMOS list).
 * @param fn        Test body receives the window, a capture function, and the
 *                  launch context (see {@link DemoContext}).
 * @param trusted   Pass false to launch without --disable-workspace-trust.
 * @param openFiles Workspace-relative paths to open as active editor tabs at
 *                  launch, bypassing Quick Open (Ctrl+P) — useful for a
 *                  freshly-seeded file whose search-index visibility a demo
 *                  can't otherwise depend on.
 */
export async function runDemo(
  name: string,
  fn: (window: Page, capture: CaptureFunction, ctx: DemoContext) => Promise<void>,
  trusted = true,
  openFiles: string[] = [],
): Promise<void> {
  const { app, window, workspaceDir } = await (trusted ? launchVSCode(openFiles) : launchVSCodeUntrusted(openFiles));
  const capture = captureSequence(window, name);
  try {
    await fn(window, capture, { app, workspaceDir });
  } finally {
    await app.close();
  }
}
