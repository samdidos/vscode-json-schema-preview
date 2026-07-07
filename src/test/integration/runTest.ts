// S08 — entry point for the real-VS-Code integration suite (S08-SR-01).
// Launches the compiled extension inside an actual VS Code build via
// @vscode/test-electron, once per fixture workspace (S08-SR-02: a plain
// single-folder workspace, then a multi-root .code-workspace), and fails the
// process on any test failure so it can gate CI (S08-SR-08).
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function runSuite(workspacePath: string, suiteEnv: string): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './index');
  // A fresh, isolated profile per run so Global-scope settings writes never
  // touch a real developer/CI-runner profile and never leak between suites.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonschema-e2e-'));

  const exitCode = await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: { ...process.env, JSONSCHEMA_E2E_SUITE: suiteEnv },
    launchArgs: [
      workspacePath,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--user-data-dir', userDataDir,
    ],
  });
  if (exitCode !== 0) {
    throw new Error(`Integration suite "${suiteEnv}" failed (exit code ${exitCode}).`);
  }
}

async function main(): Promise<void> {
  await runSuite(path.resolve(__dirname, './fixtures/single-folder'), 'single-folder');
  await runSuite(
    path.resolve(__dirname, './fixtures/multi-root/multi-root.code-workspace'),
    'multi-root',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
