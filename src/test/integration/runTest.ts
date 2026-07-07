// S08 — entry point for the real-VS-Code integration suite (S08-SR-01).
// Launches the compiled extension inside an actual VS Code build via
// @vscode/test-electron, once per fixture workspace (S08-SR-02: a plain
// single-folder workspace, then a multi-root .code-workspace), and fails the
// process on any test failure so it can gate CI (S08-SR-08).
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

// Resolve paths via __dirname (this compiled file's own on-disk location,
// out/test/integration/runTest.js) walked back up to the repo root, rather
// than process.cwd() — confirmed unreliable across platforms (on Windows,
// code that reads process.cwd() from inside the spawned Extension Host
// resolves to the downloaded VS Code binary's own install directory, not the
// repo root; see helpers.ts for the same fix).
const REPO_ROOT = path.resolve(__dirname, '../../..');
// Fixtures are plain data (JSON/YAML/TOML/.code-workspace) with no compilation
// step, so they exist only under src/ — tsc never copies them into out/.
const FIXTURES_ROOT = path.join(REPO_ROOT, 'src', 'test', 'integration', 'fixtures');

// A contribution-only fixture extension that registers the `toml` language id
// and the `yaml.schemas` configuration key — neither is provided by a bundled
// VS Code extension (they normally come from the marketplace extensions
// tamasfe.even-better-toml and redhat.vscode-yaml). Loading it declaratively
// via extensionDevelopmentPath — which is honoured even under
// --disable-extensions — keeps the run deterministic and offline, avoiding a
// flaky marketplace `--install-extension` step (and its cross-platform spawn
// pitfalls on Windows).
const SUPPORT_EXTENSION = path.join(FIXTURES_ROOT, 'test-lang-support');

async function runSuite(workspacePath: string, suiteEnv: string): Promise<void> {
  const extensionTestsPath = path.resolve(__dirname, './index');
  // A fresh, isolated profile per run so Global-scope settings writes never
  // touch a real developer/CI-runner profile and never leak between suites.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonschema-e2e-'));

  const exitCode = await runTests({
    // The extension under test plus the language-support fixture extension.
    // Development-path extensions load even under --disable-extensions, so no
    // other marketplace extension can interfere with the run.
    extensionDevelopmentPath: [REPO_ROOT, SUPPORT_EXTENSION],
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
  await runSuite(path.join(FIXTURES_ROOT, 'single-folder'), 'single-folder');
  await runSuite(
    path.join(FIXTURES_ROOT, 'multi-root', 'multi-root.code-workspace'),
    'multi-root',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
