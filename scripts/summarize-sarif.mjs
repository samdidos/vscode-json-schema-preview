#!/usr/bin/env node
// Prints CodeQL's findings — rule, severity, file and line — into the job log.
//
// Why this exists: when the `CodeQL` check fails it says only "3 new alerts
// including 3 high severity security vulnerabilities" and points at
// annotations in the web UI. Nothing in the *job log* says which rule fired or
// where, so anyone debugging from the CLI (or an agent driving the PR) is left
// guessing — and a wrong guess costs a full CI round trip. The SARIF the
// analyze step just uploaded has all of it; this reads it back out.
//
// CI-only, so exempt from S15's Node-in-the-local-gate rule — but written in
// Node anyway, since nothing here needs a shell.
//
// Usage: node scripts/summarize-sarif.mjs <file.sarif|directory> [...]
//
// A directory argument is expanded to every *.sarif it holds — codeql-action's
// `output:` directory names each file after the language it analysed, and that
// name has changed between action versions.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function expand(arg) {
  try {
    if (statSync(arg).isDirectory()) {
      return readdirSync(arg).filter((n) => n.endsWith('.sarif')).sort().map((n) => join(arg, n));
    }
  } catch {
    // Fall through: report the missing path as an unreadable file below.
  }
  return [arg];
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/summarize-sarif.mjs <file.sarif|directory> [...]');
  process.exit(2);
}
const files = args.flatMap(expand);
if (files.length === 0) {
  console.log('No SARIF files found — nothing to summarise.');
  process.exit(0);
}

/** CodeQL puts a numeric `security-severity` on security rules only. */
function severityOf(rule) {
  const score = Number(rule?.properties?.['security-severity']);
  if (!Number.isFinite(score)) { return rule?.defaultConfiguration?.level ?? 'note'; }
  if (score >= 9.0) { return 'critical'; }
  if (score >= 7.0) { return 'high'; }
  if (score >= 4.0) { return 'medium'; }
  return 'low';
}

const RANK = { critical: 0, high: 1, medium: 2, low: 3, error: 4, warning: 5, note: 6 };
const SECURITY = new Set(['critical', 'high', 'medium', 'low']);

let total = 0;

for (const file of files) {
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${file}: ${error.message}`);
    continue;
  }

  for (const run of sarif.runs ?? []) {
    // Rules live under the driver for a plain analysis, but CodeQL puts the
    // query packs' rules — every security rule among them — under
    // tool.extensions instead. Missing this reads every security finding as a
    // maintainability one, which is exactly the confusion this script exists
    // to remove.
    const rules = new Map(
      [
        ...(run.tool?.driver?.rules ?? []),
        ...(run.tool?.extensions ?? []).flatMap((extension) => extension.rules ?? []),
      ].map((rule) => [rule.id, rule]),
    );

    const findings = (run.results ?? []).map((result) => {
      const rule = rules.get(result.ruleId) ?? {};
      const location = result.locations?.[0]?.physicalLocation;
      return {
        ruleId: result.ruleId,
        severity: severityOf(rule),
        path: location?.artifactLocation?.uri ?? '(unknown file)',
        line: location?.region?.startLine ?? 0,
        message: (result.message?.text ?? '').replace(/\s+/g, ' ').trim(),
      };
    });

    findings.sort((a, b) =>
      (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) ||
      a.path.localeCompare(b.path) ||
      a.line - b.line);

    if (findings.length === 0) {
      console.log(`\n${file}: no findings.`);
      continue;
    }

    // `security-and-quality` produces a long tail of maintainability findings
    // that never fail the check. Those get one line per rule; the security
    // findings — the ones that turn the check red — get located individually.
    const security = findings.filter((f) => SECURITY.has(f.severity));
    const quality = findings.filter((f) => !SECURITY.has(f.severity));

    console.log(`\n${file}: ${findings.length} finding(s) — ${security.length} security, ${quality.length} quality`);

    for (const f of security) {
      console.log(`  [${f.severity}] ${f.ruleId}`);
      console.log(`    ${f.path}:${f.line}`);
      // Long dataflow messages are the useful part — keep them whole.
      if (f.message) { console.log(`    ${f.message}`); }
    }

    if (quality.length > 0) {
      const byRule = new Map();
      for (const f of quality) { byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1); }
      console.log('  quality findings by rule:');
      for (const [ruleId, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${count}x ${ruleId}`);
      }
    }
    total += findings.length;
  }
}

console.log(`\nTotal: ${total} finding(s) across ${files.length} SARIF file(s).`);
