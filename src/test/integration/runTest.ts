// S08 — entry point for the real-VS-Code integration suite (S08-SR-01).
// Launches the compiled extension inside an actual VS Code build via
// @vscode/test-electron, once per fixture workspace (S08-SR-02: a plain
// single-folder workspace, then a multi-root .code-workspace), and fails the
// process on any test failure so it can gate CI (S08-SR-08).
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as cp from 'child_process';
import {
  runTests,
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron';

// Fixtures are plain data (JSON/YAML/TOML/.code-workspace) with no
// compilation step, so they exist only under src/ — tsc never copies them
// into out/. Resolve via __dirname (this compiled file's own on-disk
// location, out/test/integration/runTest.js) walked back up to the repo
// root, rather than process.cwd() — confirmed unreliable across platforms
// (on Windows, code that reads process.cwd() from inside the spawned
// Extension Host resolves to the downloaded VS Code binary's own install
// directory, not the repo root; see helpers.ts for the same fix).
const FIXTURES_ROOT = path.join(__dirname, '../../..', 'src', 'test', 'integration', 'fixtures');

async function runSuite(
  vscodeExecutablePath: string,
  extensionsDir: string,
  workspacePath: string,
  suiteEnv: string,
): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './index');
  // A fresh, isolated profile per run so Global-scope settings writes never
  // touch a real developer/CI-runner profile and never leak between suites.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonschema-e2e-'));

  const exitCode = await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: { ...process.env, JSONSCHEMA_E2E_SUITE: suiteEnv },
    launchArgs: [
      workspacePath,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--user-data-dir', userDataDir,
      '--extensions-dir', extensionsDir,
    ],
  });
  if (exitCode !== 0) {
    throw new Error(`Integration suite "${suiteEnv}" failed (exit code ${exitCode}).`);
  }
}

async function main(): Promise<void> {
  const vscodeExecutablePath = await downloadAndUnzipVSCode();

  // S08-SR-04's YAML settings-scope cases need `yaml.schemas` to be a
  // registered configuration key. VS Code core doesn't bundle that — only
  // the marketplace extension redhat.vscode-yaml contributes it — so install
  // it into a fresh, isolated --extensions-dir (never a real developer/CI
  // profile) and launch without --disable-extensions so it actually loads.
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonschema-e2e-extensions-'));
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const install = cp.spawnSync(
    cli,
    [...cliArgs, '--extensions-dir', extensionsDir, '--install-extension', 'redhat.vscode-yaml'],
    { encoding: 'utf-8', stdio: 'inherit' },
  );
  if (install.status !== 0) {
    throw new Error(`Failed to install redhat.vscode-yaml (exit code ${install.status}).`);
  }

  await runSuite(vscodeExecutablePath, extensionsDir, path.join(FIXTURES_ROOT, 'single-folder'), 'single-folder');
  await runSuite(
    vscodeExecutablePath,
    extensionsDir,
    path.join(FIXTURES_ROOT, 'multi-root', 'multi-root.code-workspace'),
    'multi-root',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
