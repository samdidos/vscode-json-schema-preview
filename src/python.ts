import * as vscode from 'vscode';
import { execFile } from 'child_process';

// Per-interpreter cache: once the package is confirmed present we skip re-checking.
const packageReadyFor = new Set<string>();

// ---------------------------------------------------------------------------
// Interpreter resolution
// ---------------------------------------------------------------------------

/**
 * Returns the Python interpreter path declared in VS Code's Python extension.
 * Falls back to python.defaultInterpreterPath setting, then to 'python3'.
 */
export async function getPythonInterpreter(): Promise<string> {
  try {
    const pyExt = vscode.extensions.getExtension('ms-python.python');
    if (pyExt) {
      if (!pyExt.isActive) {
        await pyExt.activate();
      }
      const api = pyExt.exports;

      // New environments API (Python extension >= 2022.3)
      if (api?.environments?.getActiveEnvironmentPath) {
        const resource = vscode.workspace.workspaceFolders?.[0];
        const envPath = api.environments.getActiveEnvironmentPath(resource);
        if (envPath) {
          if (api.environments.resolveEnvironment) {
            const resolved = await api.environments.resolveEnvironment(envPath);
            const exe = resolved?.executable?.uri?.fsPath;
            if (exe) return exe;
          }
          if (envPath.path) return envPath.path;
        }
      }

      // Legacy API (Python extension < 2022.3)
      if (api?.settings?.getExecutionDetails) {
        const details = api.settings.getExecutionDetails(
          vscode.workspace.workspaceFolders?.[0]?.uri
        );
        const exe = details?.execCommand?.[0];
        if (exe) return exe;
      }
    }
  } catch {
    // Fall through
  }

  const config = vscode.workspace.getConfiguration('python');
  const fromSettings =
    config.get<string>('defaultInterpreterPath') ?? config.get<string>('pythonPath');
  if (fromSettings && fromSettings !== '' && fromSettings !== 'python' && fromSettings !== 'python3') {
    return fromSettings;
  }

  return 'python3';
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

export function run(cmd: string, args: string[], timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: timeoutMs }, err => (err ? reject(err) : resolve()))
  );
}

export function capture(cmd: string, args: string[], timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    })
  );
}

// ---------------------------------------------------------------------------
// Dependency management
// ---------------------------------------------------------------------------

/**
 * Ensures json-schema-for-humans is installed under the given interpreter,
 * auto-installing via pip if needed. Uses --user for system Python; falls back
 * to a plain install inside virtual environments where --user is not applicable.
 */
export async function ensureInstalled(python: string): Promise<void> {
  if (packageReadyFor.has(python)) {
    return;
  }

  const alreadyInstalled = await run(python, ['-c', 'import json_schema_for_humans'], 8_000)
    .then(() => true)
    .catch(() => false);

  if (alreadyInstalled) {
    packageReadyFor.add(python);
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'JSON Schema Preview', cancellable: false },
    async progress => {
      progress.report({ message: `Installing json-schema-for-humans into ${python}…` });
      try {
        await run(python, ['-m', 'pip', 'install', '--user', 'json-schema-for-humans'], 120_000);
      } catch {
        // Inside a venv --user is rejected; retry without it
        await run(python, ['-m', 'pip', 'install', 'json-schema-for-humans'], 120_000);
      }
      packageReadyFor.add(python);
    }
  );
}
