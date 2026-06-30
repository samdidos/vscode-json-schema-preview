import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const EXT_ROOT = path.resolve(__dirname, '../../../..');
export const SHOWCASE_DIR = path.join(EXT_ROOT, 'showcase'); // source — never written to by tests

// Per-process temp dirs so tests never touch tracked source files and each run
// starts from a clean state.
// mkdtempSync atomically creates a uniquely-named directory with secure
// permissions, so there's no predictable-path race (CodeQL
// js/insecure-temporary-file) and each run still starts from a clean state.
export const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-e2e-'));
export const WORKSPACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-e2e-workspace-'));

// Seed the fresh temp workspace with the showcase tree before the first launch.
fs.cpSync(SHOWCASE_DIR, WORKSPACE_DIR, { recursive: true });

/** Path to the VS Code user settings.json inside USER_DATA_DIR. */
export const USER_SETTINGS_PATH = path.join(USER_DATA_DIR, 'User', 'settings.json');

/**
 * Writes a file into the per-process workspace copy before launching. Useful for
 * demos that need a fixture the showcase doesn't ship (e.g. a data file carrying
 * a remote `$schema` so the auth status-bar indicator appears).
 */
export function seedWorkspaceFile(relPath: string, contents: string): void {
  const target = path.join(WORKSPACE_DIR, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

/**
 * Writes VS Code user settings before launching. Call this before runDemo if
 * the test relies on specific settings being present from the start (avoids
 * fighting IntelliSense autocomplete when editing settings.json via the UI).
 */
export function seedUserSettings(settings: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(USER_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--disable-updates',
  '--skip-welcome',
  '--skip-release-notes',
  // Disable all other extensions so Copilot/Chat can't steal focus on a fresh
  // profile. --extensionDevelopmentPath still loads the extension under test.
  '--disable-extensions',
  `--user-data-dir=${USER_DATA_DIR}`,
  `--extensionDevelopmentPath=${EXT_ROOT}`,
  WORKSPACE_DIR,
];

export interface VSCodeInstance {
  app: ElectronApplication;
  window: Page;
}

// Cached so multiple launch calls in the same process don't re-download.
let executablePromise: Promise<string> | undefined;

function getExecutable(): Promise<string> {
  if (!executablePromise) {
    const distPath = path.join(EXT_ROOT, 'dist', 'extension.js');
    if (!fs.existsSync(distPath)) {
      throw new Error('Extension not built. Run `npm run compile` first.');
    }
    executablePromise = downloadAndUnzipVSCode('stable');
  }
  return executablePromise;
}

async function launch(args: string[]): Promise<VSCodeInstance> {
  const executablePath = await getExecutable();
  // Strip ELECTRON_RUN_AS_NODE so the binary launches as the VS Code GUI,
  // not as a plain Node.js process (which prevents the CDP handshake).
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  const app = await electron.launch({ executablePath, args, env });
  const window = await app.firstWindow();
  await window.waitForSelector('.monaco-workbench', { timeout: 60_000 });

  // Resize the Electron window before VS Code finalises its layout.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { win.setSize(1400, 900); win.center(); }
  });

  // VS Code restores panel states (including the secondary sidebar) asynchronously
  // after the workbench renders — 5 s gives it time to finish before we check.
  await window.waitForTimeout(5_000);

  // Force the secondary sidebar (Chat/Copilot panel) closed.
  // Ctrl+Alt+B is a toggle, so we press it unconditionally, then check whether
  // the sidebar is now visible. If it is, we accidentally opened it (it was
  // already closed), so we press once more to close it.
  // window.focus() ensures the key lands on the workbench, not a stray element.
  await window.bringToFront();
  await window.keyboard.press('Control+Alt+B');
  await window.waitForTimeout(800);

  const openedByToggle = await window.evaluate(() => {
    const el = document.querySelector('.part.auxiliarybar-part') as HTMLElement | null;
    return el !== null && el.offsetWidth > 0;
  });
  if (openedByToggle) {
    await window.keyboard.press('Control+Alt+B');
    await window.waitForTimeout(600);
  }

  // Dismiss any startup notifications (e.g. "extension activated") so they
  // don't overlap demo content in screenshots.
  const closeButtons = await window.$$('.notification-list-item .codicon-notifications-clear');
  for (const btn of closeButtons) {
    await btn.click().catch(() => {});
  }
  await window.waitForTimeout(300);

  return { app, window };
}

/** Launches VS Code with the workspace pre-trusted (the normal demo path). */
export const launchVSCode = (): Promise<VSCodeInstance> =>
  launch([...BASE_ARGS, '--disable-workspace-trust']);

/**
 * Launches VS Code WITHOUT pre-trusting the workspace so that workspace-trust
 * prompts and restricted-mode behaviour are observable.
 */
export const launchVSCodeUntrusted = (): Promise<VSCodeInstance> =>
  launch(BASE_ARGS); // intentionally omits --disable-workspace-trust
