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

/** Opens a file by name using VS Code's Quick Open (Ctrl+P). */
export const openFile = (window: Page, filename: string): Promise<void> =>
  quickOpen(window, 'Control+p', filename, 1_500);

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
