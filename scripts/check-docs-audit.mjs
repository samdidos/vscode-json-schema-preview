#!/usr/bin/env node
// Audits docs/'s dependencies (S09-SR-09), failing only on a high/critical
// advisory that `npm audit fix` could actually resolve. A plain
// `npm audit --audit-level=high` would also fail on an advisory with no
// upstream fix yet (e.g. GHSA-fx2h-pf6j-xcff, currently open against
// vitepress's vite dependency) — that isn't actionable from this repo and
// would leave the check permanently red until upstream ships a fix. Findings
// with no fix available are still printed, just not treated as blocking.
//
// Plain Node, no shell assumed beyond Node itself (`shell: true` lets Node
// resolve npm via its platform-native shim) — S15-SR-01/02.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: DOCS_DIR,
  shell: true,
  encoding: 'utf8',
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("Could not parse `npm audit --json` output from docs/:");
  console.error(result.stdout || result.stderr || '(no output)');
  process.exit(1);
}

const blocking = [];
const accepted = [];

for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;
  const line = `${vuln.name} (${vuln.severity}, ${vuln.range})`;
  if (vuln.fixAvailable === false) {
    accepted.push(line);
  } else {
    blocking.push(line);
  }
}

if (accepted.length > 0) {
  console.log('docs/: high/critical advisories with no upstream fix yet (tracked, not blocking):');
  for (const line of accepted) console.log(`  - ${line}`);
}

if (blocking.length > 0) {
  console.error('\ndocs/: high/critical advisories with a fix available — run `npm audit fix --prefix docs`:');
  for (const line of blocking) console.error(`  - ${line}`);
  process.exit(1);
}

console.log('\ndocs/ audit: no actionable high/critical advisories.');
