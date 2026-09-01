#!/usr/bin/env node
// Checks whether typescript-eslint has caught up to TypeScript 7 yet — the
// blocker behind the `typescript` major-version ignore rule in
// .github/dependabot.yml (see PR #220): @typescript-eslint/eslint-plugin and
// @typescript-eslint/parser both peer on `typescript@">=4.8.4 <6.1.0"` today,
// so `npm ci` fails with ERESOLVE the instant typescript bumps to 7.x.
//
// Fetches each package's *latest* published peerDependencies.typescript
// range from the npm registry and checks whether it overlaps `>=7.0.0`.
// Purely informational — exits 0 either way — but writes a `supported`
// step output so a CI workflow can act on it (open a tracking issue only
// when the answer flips to true, not on every run).
//
// Run standalone: node scripts/check-ts7-eslint-support.mjs

import semver from 'semver';

const PACKAGES = ['@typescript-eslint/eslint-plugin', '@typescript-eslint/parser'];
const TS7_RANGE = '>=7.0.0';

async function fetchPeerRange(name) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`timed out contacting registry.npmjs.org for ${name}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`registry.npmjs.org returned HTTP ${res.status} for ${name}`);

  const data = await res.json();
  const range = data.peerDependencies?.typescript;
  const version = typeof data.version === 'string' ? data.version : 'unknown';
  return { range, version };
}

async function main() {
  const results = [];
  for (const name of PACKAGES) {
    const { range, version } = await fetchPeerRange(name);
    const supportsTs7 = typeof range === 'string' && semver.validRange(range) !== null
      ? semver.intersects(range, TS7_RANGE, { includePrerelease: false })
      : null; // no parseable range — don't claim an answer either way
    results.push({ name, version, range, supportsTs7 });
  }

  console.log('typescript-eslint TS7 peer-range check');
  console.log('─'.repeat(48));
  for (const { name, version, range, supportsTs7 } of results) {
    const label = supportsTs7 === null ? 'UNKNOWN (unparseable range)' : supportsTs7 ? 'supports TS 7' : 'blocks TS 7';
    console.log(`  ${name}@${version}  peer typescript: ${range ?? '(none declared)'}  →  ${label}`);
  }

  const allSupport = results.every((r) => r.supportsTs7 === true);
  console.log('─'.repeat(48));
  console.log(allSupport
    ? '✓ All checked packages now allow TypeScript 7 — the dependabot.yml ignore rule can be lifted.'
    : '✗ At least one package still blocks TypeScript 7 — leave the ignore rule in place.');

  if (process.env.GITHUB_OUTPUT) {
    const fs = await import('node:fs');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `supported=${allSupport}\n`);
  }
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
