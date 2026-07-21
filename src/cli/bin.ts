// F27 — the executable entry point. Deliberately thin (F27-NFR-02): it wires the
// real filesystem, `fetch`, stdout/stderr, and `process.exit` to the pure
// `runCli` core, which holds all routing and formatting logic. This is the CLI's
// only I/O-bound file and its sole coverage/mutation exclusion.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { runCli, type CliIO } from './cli';

// Injected at build time from the CLI package's own package.json.
declare const CLI_VERSION: string;

/** Recursively list files under `dir`, skipping dependency/build/VCS trees. */
function walk(dir: string): string[] {
  const skip = new Set(['node_modules', '.git', 'dist', 'out', '.vscode-test', 'coverage']);
  const files: string[] = [];
  const visit = (d: string): void => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip rather than abort the scan
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) { visit(join(d, e.name)); }
      } else if (e.isFile()) {
        files.push(join(d, e.name));
      }
    }
  };
  visit(dir);
  return files;
}

const io: CliIO = {
  readFile: (absPath: string) => readFileSync(absPath, 'utf-8'),
  fetchText: async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) { throw new Error(`HTTP ${res.status} fetching ${url}`); }
    return res.text();
  },
  walk,
  cwd: process.cwd(),
  version: typeof CLI_VERSION === 'string' ? CLI_VERSION : '0.0.0',
};

runCli(process.argv.slice(2), io)
  .then((result) => {
    if (result.stdout) { process.stdout.write(result.stdout); }
    if (result.stderr) { process.stderr.write(result.stderr); }
    process.exit(result.code);
  })
  .catch((e: unknown) => {
    process.stderr.write(`Unexpected error: ${(e as Error).message}\n`);
    process.exit(70); // EX_SOFTWARE — an internal fault, distinct from data/usage
  });
