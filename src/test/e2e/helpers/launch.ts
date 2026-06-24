import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import path from 'path';
import fs from 'fs';

export const EXT_ROOT = path.resolve(__dirname, '../../../..');
export const SHOWCASE_DIR = path.join(EXT_ROOT, 'showcase');

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--disable-updates',
  '--skip-welcome',
  '--skip-release-notes',
  `--extensionDevelopmentPath=${EXT_ROOT}`,
  SHOWCASE_DIR,
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
  const app = await electron.launch({ executablePath, args });
  const window = await app.firstWindow();
  await window.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  await window.waitForTimeout(3_000);
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
