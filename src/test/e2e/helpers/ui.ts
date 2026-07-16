import { Page } from 'playwright';

async function quickOpen(
  window: Page,
  triggerKey: string,
  text: string,
  settleMs: number,
): Promise<void> {
  await window.keyboard.press(triggerKey);
  await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
  await window.keyboard.type(text, { delay: 40 });
  await window.waitForTimeout(600);
  await window.keyboard.press('Enter');
  await window.waitForTimeout(settleMs);
}

const ROW_WAIT_MS = 20_000;

/**
 * Opens a file by name using VS Code's Quick Open (Ctrl+P). Robust to a
 * freshly-seeded workspace whose file-search index is still building:
 *  - waits for the *file itself* to appear as a result row (not just any row),
 *    so a stale/partial list can't leave the wrong entry selected when Enter
 *    fires — a blind Enter on the wrong row silently opens the wrong file (or
 *    none), failing confusingly much later downstream;
 *  - on a loaded CI runner the index can take longer than a single generous
 *    wait to warm up (observed: later tests in a run, after several prior VS
 *    Code launches, occasionally need more than 10s), so this retries the
 *    query once with a fresh wait rather than failing on one slow attempt;
 *  - a short settle lets ranking finalise so the match is the top result;
 *  - confirms an editor actually rendered afterwards via the editor content
 *    (`.view-lines`), NOT the tab's `aria-label`, which proved unreliable for
 *    files opened from subfolders.
 */
export async function openFile(window: Page, filename: string): Promise<void> {
  await window.keyboard.press('Control+p');
  await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
  const rowSelector = `.quick-input-list .monaco-list-row:has-text("${filename}")`;
  await window.keyboard.type(filename, { delay: 40 });
  try {
    await window.waitForSelector(rowSelector, { state: 'visible', timeout: ROW_WAIT_MS });
  } catch {
    // One retry: clear and retype in case the search provider was still
    // warming up and never re-ran against the fully-typed query.
    await window.keyboard.press('Control+a');
    await window.keyboard.type(filename, { delay: 40 });
    await window.waitForSelector(rowSelector, { state: 'visible', timeout: ROW_WAIT_MS });
  }
  await window.waitForTimeout(400);
  await window.keyboard.press('Enter');
  await window.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(300);
}

/** Opens the Command Palette, types a command, and confirms with Enter. */
export const runCommand = (window: Page, command: string): Promise<void> =>
  quickOpen(window, 'Control+Shift+p', command, 2_500);

/** Waits for a notification toast containing the given text. */
export async function waitForNotification(window: Page, text: string, timeout = 15_000): Promise<void> {
  await window.waitForSelector(`.notification-list-item-message:has-text("${text}")`, { timeout });
}

/** Dismisses all visible notification toasts. */
export async function dismissNotifications(window: Page): Promise<void> {
  const closeButtons = await window.$$('.notification-list-item .codicon-notifications-clear');
  for (const btn of closeButtons) {
    await btn.click().catch(() => {});
  }
  await window.waitForTimeout(300);
}

/**
 * Clicks the first element that matches any of the given selectors.
 * Returns false if none matched (caller can fall back to keyboard).
 */
export async function clickFirstMatch(window: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    const el = await window.$(sel);
    if (el) {
      await el.click();
      return true;
    }
  }
  return false;
}
