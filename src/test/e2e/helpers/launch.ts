import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const EXT_ROOT = path.resolve(__dirname, '../../../..');
export const SHOWCASE_DIR = path.join(EXT_ROOT, 'showcase'); // source — never written to by tests

// Every launch gets a FRESH user-data dir and workspace copy. The demos all
// assume a pristine VS Code (clean status bar, no restored tabs, no leftover
// settings), and sharing dirs across the 16 demos broke that in subtle ways:
// session restore re-opened tabs from the previous demo, command-palette MRU
// re-ranked entries, and json.schemas bindings written by one demo leaked into
// the next. (Concretely: a stray "Configure Preview" palette pick in an early
// demo created .json-schema-preview-config.json, opened it pinned, and bound it
// in workspace settings — session restore then made it the active editor in
// demo-schema-auth-mouse, whose status-bar wait timed out on schemas.acme.dev.)
//
// mkdtempSync atomically creates uniquely-named dirs with secure permissions
// (no predictable-path race — CodeQL js/insecure-temporary-file).

// Seeds staged by tests before runDemo() launches VS Code; applied to the
// fresh workspace/user-data dirs created for that launch.
const pendingWorkspaceFiles: Array<{ relPath: string; contents: string }> = [];
let pendingUserSettings: Record<string, unknown> | undefined;

/**
 * Stages a file to be written into the demo's workspace copy before launch.
 * Useful for demos that need a fixture the showcase doesn't ship (e.g. a data
 * file carrying a remote `$schema` so the auth status-bar indicator appears).
 */
export function seedWorkspaceFile(relPath: string, contents: string): void {
  pendingWorkspaceFiles.push({ relPath, contents });
}

/**
 * Stages VS Code user settings to be written before launch. Call this before
 * runDemo if the test relies on specific settings being present from the start
 * (avoids fighting IntelliSense autocomplete when editing settings.json via the UI).
 */
export function seedUserSettings(settings: Record<string, unknown>): void {
  pendingUserSettings = settings;
}

/** Creates the isolated dirs for one launch and applies any staged seeds. */
function prepareSessionDirs(): { userDataDir: string; workspaceDir: string } {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-e2e-'));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-e2e-workspace-'));
  fs.cpSync(SHOWCASE_DIR, workspaceDir, { recursive: true });

  for (const { relPath, contents } of pendingWorkspaceFiles.splice(0)) {
    const target = path.join(workspaceDir, relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }

  if (pendingUserSettings) {
    const settingsPath = path.join(userDataDir, 'User', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(pendingUserSettings, null, 2));
    pendingUserSettings = undefined;
  }

  return { userDataDir, workspaceDir };
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
  `--extensionDevelopmentPath=${EXT_ROOT}`,
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

async function launch(extraArgs: string[]): Promise<VSCodeInstance> {
  const executablePath = await getExecutable();
  const { userDataDir, workspaceDir } = prepareSessionDirs();
  const args = [
    ...BASE_ARGS,
    ...extraArgs,
    `--user-data-dir=${userDataDir}`,
    workspaceDir,
  ];
  // Strip ELECTRON_RUN_AS_NODE so the binary launches as the VS Code GUI,
  // not as a plain Node.js process (which prevents the CDP handshake).
  const { ELECTRON_RUN_AS_NODE: _, ...rest } = process.env;
  const env = Object.fromEntries(
    Object.entries(rest).filter((e): e is [string, string] => e[1] !== undefined)
  );
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
  launch(['--disable-workspace-trust']);

/**
 * Launches VS Code WITHOUT pre-trusting the workspace so that workspace-trust
 * prompts and restricted-mode behaviour are observable.
 */
export const launchVSCodeUntrusted = (): Promise<VSCodeInstance> =>
  launch([]); // intentionally omits --disable-workspace-trust
