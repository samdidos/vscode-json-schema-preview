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

async function getExecutable(): Promise<string> {
  const distPath = path.join(EXT_ROOT, 'dist', 'extension.js');
  if (!fs.existsSync(distPath)) {
    throw new Error('Extension not built. Run `npm run compile` first.');
  }
  return downloadAndUnzipVSCode('stable');
}

/** Launches VS Code with the workspace pre-trusted (the normal demo path). */
export async function launchVSCode(): Promise<VSCodeInstance> {
  const executablePath = await getExecutable();

  const app = await electron.launch({
    executablePath,
    args: [...BASE_ARGS, '--disable-workspace-trust'],
  });

  const window = await app.firstWindow();
  await window.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  await window.waitForTimeout(3_000);

  return { app, window };
}

/**
 * Launches VS Code WITHOUT pre-trusting the workspace so that workspace-trust
 * prompts and restricted-mode behaviour are observable.
 */
export async function launchVSCodeUntrusted(): Promise<VSCodeInstance> {
  const executablePath = await getExecutable();

  const app = await electron.launch({
    executablePath,
    args: BASE_ARGS, // intentionally omits --disable-workspace-trust
  });

  const window = await app.firstWindow();
  await window.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  await window.waitForTimeout(3_000);

  return { app, window };
}
