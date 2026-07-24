#!/usr/bin/env node
// Sync static shields.io badges in README.md from live project data.
//
// Vendor-neutral: run it directly as `npm run badges:sync` (or
// `node scripts/sync-readme-badges.mjs`). It reads package.json and, when
// present, coverage/coverage-summary.json, and rewrites the matching static
// shields.io badges in README.md. It never fails a build — a missing coverage
// summary just leaves the coverage badge untouched.
//
// Called from two places, both through the npm command so the logic lives here
// only (AGENTS.md "reach shared logic through vendor-neutral commands"):
//   - `.claude/hooks/update-readme-badges.mjs` — a Claude Code convenience hook,
//     after package.json edits (engine/node/license badges).
//   - `.github/workflows/maturity-refresh.yml` — the weekly CI job that runs
//     coverage and opens a data-only PR, so the coverage badge is refreshed and
//     committed as a real pipeline guarantee, not only when an agent happens to
//     run.
//
// The coverage badge is only as fresh as the last coverage run on disk, so run
// `npm run test:coverage` first if you invoke this by hand.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = join(ROOT, 'README.md');
let text = readFileSync(readmePath, 'utf-8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const covPath = join(ROOT, 'coverage', 'coverage-summary.json');
const changes = [];

// Percent-encodes like Python's urllib.parse.quote(s, safe='') — the
// unreserved set is letters/digits/_.-~ only, so !*'() get encoded too
// (unlike encodeURIComponent, which leaves those four unescaped).
function enc(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function applyBadge(regex, replacement, label) {
  if (regex.test(text)) {
    text = text.replace(regex, replacement);
    changes.push(label);
  }
}

// ── Coverage badge ────────────────────────────────────────────────────────────
if (existsSync(covPath)) {
  const totals = JSON.parse(readFileSync(covPath, 'utf-8')).total ?? {};
  const pcts = Object.values(totals)
    .map((v) => v?.pct)
    .filter((pct) => typeof pct === 'number');
  if (pcts.length) {
    const minPct = Math.min(...pcts);
    const pctStr = `${minPct.toFixed(1)}%`;
    const color = minPct >= 80 ? 'brightgreen' : minPct >= 70 ? 'yellow' : 'red';
    const newUrl = `https://img.shields.io/badge/coverage-${enc(pctStr)}-${color}`;
    // The coverage badge has no ?params, so [^)]+ safely captures the full URL
    applyBadge(/https:\/\/img\.shields\.io\/badge\/coverage-[^)]+/, newUrl, `coverage=${pctStr}`);
  }
}

// ── VS Code engine badge ──────────────────────────────────────────────────────
// URL-encoded engine strings (e.g. %5E1.96.0) contain no literal hyphens,
// so [^-]+ safely matches the value up to the -blue colour segment.
const vscode = pkg.engines?.vscode ?? '';
if (vscode) {
  applyBadge(
    /(https:\/\/img\.shields\.io\/badge\/VS%20Code-)[^-]+(-blue)/,
    `$1${enc(vscode)}$2`,
    `vscode=${vscode}`,
  );
}

// ── Node engine badge ─────────────────────────────────────────────────────────
const nodeVer = pkg.engines?.node ?? '';
if (nodeVer) {
  applyBadge(
    /(https:\/\/img\.shields\.io\/badge\/node-)[^-]+(-brightgreen)/,
    `$1${enc(nodeVer)}$2`,
    `node=${nodeVer}`,
  );
}

// ── License badge ─────────────────────────────────────────────────────────────
const lic = pkg.license ?? '';
if (lic) {
  applyBadge(
    /(https:\/\/img\.shields\.io\/badge\/License-)[^-]+(-yellow)/,
    `$1${enc(lic)}$2`,
    `license=${lic}`,
  );
}

// ── Write back ──────────────────────────────────────────────────────────────
writeFileSync(readmePath, text);
if (changes.length) {
  console.error(`✓ README badges synced: ${changes.join(', ')}`);
} else {
  console.error('✓ README badges already current.');
}
