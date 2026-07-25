#!/usr/bin/env node
// Concurrent local verify gate (S17). `npm run verify` used to be a chain of
// `&&`-joined `npm run` calls: the first failing step stopped everything,
// hiding whatever a later step would also have found, and the wall-clock
// cost was the sum of every step instead of the slowest one. This script
// runs every step concurrently, then prints one summary covering all of
// them — pass/fail, duration, and (for failures) the full captured output —
// regardless of which step(s) failed (S17-SR-01/02/03).
//
// Usage:
//   node scripts/verify.mjs               run every step, report at the end
//   node scripts/verify.mjs --fail-fast   cancel remaining steps on the
//                                         first failure (S17-SR-04)
//
// The step list (S17-SR-05) is declared once, here — package.json's `verify`
// script only invokes this file.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const IS_WINDOWS = process.platform === 'win32';

// name === the npm script invoked (`npm run <name>`), except where noted.
export const STEPS = [
  'lint',
  'lint:workflows',
  'type-check',
  'check:traceability',
  'check:doc-traceability',
  'check:consistency',
  'check:spec-effort',
  'check:spec-value',
  'check:audit',
  'test:coverage',
];

/** Formats a millisecond duration as e.g. "3.2s" — used only in the summary. */
export function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Renders the final report: a table of every step's outcome, then the full
 *  captured output of any step that failed. Pure function of the results
 *  array so it's testable without spawning anything. */
export function renderSummary(results) {
  const nameWidth = Math.max(...results.map((r) => r.name.length), 4);
  const lines = ['', 'Verify summary', '─'.repeat(nameWidth + 24)];
  for (const r of results) {
    const status = r.cancelled ? '⦸ cancelled' : r.code === 0 ? '✓ pass' : '✗ FAIL';
    lines.push(`${r.name.padEnd(nameWidth)}  ${status.padEnd(12)}${formatDuration(r.durationMs)}`);
  }
  const failed = results.filter((r) => !r.cancelled && r.code !== 0);
  for (const r of failed) {
    lines.push('', `── ${r.name} output ${'─'.repeat(Math.max(0, 40 - r.name.length))}`, r.output.trimEnd());
  }
  lines.push('', failed.length
    ? `✗ ${failed.length}/${results.length} step(s) failed.`
    : `✓ All ${results.length} steps passed.`);
  return lines.join('\n');
}

function startStep(name) {
  const start = Date.now();
  // `npm run <name>` spawns its own child (the actual lint/tsc/mocha
  // process), so a plain `child.kill()` on fail-fast would only ever signal
  // the npm wrapper, orphaning the real work underneath it. Detaching on
  // POSIX puts the whole tree in its own process group, killable via the
  // negative-pid convention below; Windows has no such group, so it's killed
  // by `taskkill /T` (tree) on the wrapper's pid instead.
  const child = spawn(NPM_CMD, ['run', name], { cwd: ROOT, detached: !IS_WINDOWS });
  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });
  const done = new Promise((resolveStep) => {
    child.on('close', (code) => {
      resolveStep({ name, code, cancelled: false, output, durationMs: Date.now() - start });
    });
  });
  return { name, child, done };
}

function killStep(child) {
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

async function run(failFast) {
  const started = STEPS.map(startStep);
  const results = new Array(started.length);
  const pending = new Map(started.map((s, i) => [i, s.done.then((r) => ({ i, r }))]));

  while (pending.size) {
    const { i, r } = await Promise.race(pending.values());
    pending.delete(i);
    results[i] = r;
    if (r.code !== 0 && failFast) {
      for (const [j, s] of started.entries()) {
        if (!results[j] && s.child.exitCode === null && s.child.signalCode === null) {
          killStep(s.child);
        }
      }
    }
  }

  // A step's own script always closes with a real integer exit code, even on
  // internal crash — `code === null` only happens when we killed it above
  // (SIGTERM instead of a natural exit), so that's an unambiguous signal to
  // report it as cancelled rather than as a plain failure in the summary.
  for (let i = 0; i < results.length; i++) {
    if (results[i].code === null) results[i] = { ...results[i], cancelled: true };
  }

  console.log(renderSummary(results));
  process.exitCode = results.some((r) => !r.cancelled && r.code !== 0) ? 1 : 0;
}

// No top-level `await` here (even inside an `if`, its mere presence in the
// module marks the whole ESM graph as asynchronous) — that would make this
// file unloadable via the synchronous `require()` interop the compiled
// (CommonJS) unit tests use to import it for direct testing.
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  run(process.argv.includes('--fail-fast')).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
