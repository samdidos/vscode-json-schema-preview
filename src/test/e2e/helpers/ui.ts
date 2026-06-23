import { Page } from 'playwright';

/** Opens a file by name using VS Code's Quick Open (Ctrl+P). */
export async function openFile(window: Page, filename: string): Promise<void> {
  await window.keyboard.press('Control+p');
  await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
  await window.keyboard.type(filename, { delay: 40 });
  await window.waitForTimeout(600);
  await window.keyboard.press('Enter');
  await window.waitForTimeout(1_500);
}

/** Opens the Command Palette, types a command, and confirms with Enter. */
export async function runCommand(window: Page, command: string): Promise<void> {
  await window.keyboard.press('Control+Shift+p');
  await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
  await window.keyboard.type(command, { delay: 40 });
  await window.waitForTimeout(600);
  await window.keyboard.press('Enter');
  await window.waitForTimeout(2_500);
}

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
