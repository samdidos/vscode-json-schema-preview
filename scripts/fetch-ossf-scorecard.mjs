#!/usr/bin/env node
// Refreshes the cached OpenSSF Scorecard grade for this repo.
//
// This is the ONE networked step in the maturity tooling, kept separate on
// purpose: scripts/maturity-score.mjs stays offline and deterministic (it reads
// the cache this writes), so `npm run maturity:check` is reproducible in CI and
// in sandboxes with no egress. Run this wherever api.securityscorecards.dev is
// reachable (a dev machine, or CI with the right network policy), then commit
// the refreshed ossf-scorecard.json:
//   node scripts/fetch-ossf-scorecard.mjs
//
// The Scorecard project must have a published run for this repo (the
// scorecard.yml workflow publishes to the API). Grade is 0–10.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'ossf-scorecard.json');

function repoSlug() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const url = pkg.repository?.url ?? '';
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`could not parse owner/repo from package.json repository.url: "${url}"`);
  return { owner: m[1], repo: m[2] };
}

async function main() {
  const { owner, repo } = repoSlug();
  const api = `https://api.securityscorecards.dev/projects/github.com/${owner}/${repo}`;
  process.stderr.write(`→ Fetching OpenSSF Scorecard for ${owner}/${repo}…\n`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res;
  try {
    res = await fetch(api, { headers: { accept: 'application/json' }, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timed out contacting api.securityscorecards.dev');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new Error('no published Scorecard run for this repo yet — the scorecard.yml workflow must run first.');
  }
  if (!res.ok) throw new Error(`api.securityscorecards.dev returned HTTP ${res.status}`);

  const data = await res.json();
  const cache = {
    $comment: 'Cached OpenSSF Scorecard grade read by scripts/maturity-score.mjs. Refresh with `npm run maturity:ossf`.',
    source: api,
    fetchedAt: new Date().toISOString().slice(0, 10),
    scorecardDate: data.date ?? null,
    score: data.score ?? null,
    checks: Array.isArray(data.checks)
      ? data.checks.map((c) => ({ name: c.name, score: c.score })).sort((a, b) => a.name.localeCompare(b.name))
      : [],
  };
  writeFileSync(OUT_PATH, JSON.stringify(cache, null, 2) + '\n');
  process.stderr.write(`✓ Wrote ossf-scorecard.json (grade ${cache.score}/10). Run \`npm run maturity\` to fold it into the score.\n`);
}

main().catch((e) => {
  process.stderr.write(`✗ ${e.message}\n`);
  process.exit(1);
});
