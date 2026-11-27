#!/usr/bin/env node
// F26-FR-09..11 — the compat-gate action's glue. Finds the schema files a push
// or pull request changed, runs `jstk diff --check` on each against its version
// at the base commit, writes the job summary, and exits with the verdict.
// Node + git only (S15); every comparison is the CLI's (F26-FR-11).
//
// Inputs (environment): GATE_BASE (commit to compare against), GATE_SCHEMAS
// (newline-separated globs), GATE_STRICT ('true'/'false'), GATE_CLI (path to the
// built cli.js). Writes GITHUB_STEP_SUMMARY and GITHUB_OUTPUT when set.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const DEFAULT_SCHEMAS = ['**/*.schema.json', '**/*.schema.yaml', '**/*.schema.yml'];

/** `**` (any depth), `*` and `?` (within one path segment) → anchored RegExp. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` matches zero or more whole directories; a bare `**` anything.
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** Parse `git diff --name-status -M` output. */
function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map(line => {
    const [status, a, b] = line.split('\t');
    const kind = status[0];
    return kind === 'R' ? { kind, oldPath: a, path: b } : { kind, oldPath: a, path: a };
  });
}

// Node's default child-output cap is 1 MiB; a bundled schema or a large diff
// listing easily exceeds it, and the overflow would kill the gate (ENOBUFS).
const MAX_BUFFER = 512 * 1024 * 1024;
const GIT_OPTS = { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER };
const git = (...args) => execFileSync('git', args, { ...GIT_OPTS, encoding: 'utf-8' });
/** A file's bytes at `rev`, untouched by any text decoding. */
const gitShow = (rev, file) => execFileSync('git', ['show', `${rev}:${file}`], GIT_OPTS);

function ensureBase(base) {
  try { git('cat-file', '-e', `${base}^{commit}`); return; } catch { /* not fetched yet */ }
  git('fetch', '--no-tags', '--depth=1', 'origin', base);
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function compare(cli, base, change, strict, scratch) {
  if (change.kind === 'A') { return { ...change, verdict: 'new', report: 'New schema — nothing to compare against.' }; }
  if (change.kind === 'D') {
    return { ...change, verdict: 'breaking', report: 'Schema deleted — every document that relied on it loses its contract.' };
  }
  // Same basename as the original, so the report names the file and the CLI
  // picks the parser by its extension; one directory per file avoids clashes.
  const dir = mkdtempSync(join(scratch, 'base-'));
  const oldFile = join(dir, basename(change.oldPath));
  writeFileSync(oldFile, gitShow(base, change.oldPath));
  const args = [cli, 'diff', oldFile, change.path, '--check'];
  if (strict) { args.push('--strict'); }
  const run = spawnSync(process.execPath, args, { encoding: 'utf-8', maxBuffer: MAX_BUFFER });
  if (run.error) { return { ...change, verdict: 'error', report: `Could not run the CLI: ${run.error.message}` }; }
  const report = (run.stdout || run.stderr || '').trim();
  const verdict = { 0: 'compatible', 1: 'breaking', 2: 'unknown' }[run.status] ?? 'error';
  return { ...change, verdict, report };
}

const ICON = { compatible: '✅', breaking: '⛔', unknown: '⚠️', new: '🆕', error: '❌' };

function overall(results) {
  for (const v of ['error', 'breaking', 'unknown']) {
    if (results.some(r => r.verdict === v)) { return v; }
  }
  return 'compatible';
}

function renderSummary(results, verdict, base) {
  const headline = {
    compatible: '✅ Backward-compatible — no changed schema breaks existing documents',
    breaking: '⛔ NOT backward-compatible',
    unknown: '⚠️ Compatibility unknown — strict mode could not prove every change safe',
    error: '❌ A schema could not be compared',
  }[verdict];
  const lines = [`## JSON Schema compatibility gate`, '', `**${headline}** (against \`${base.slice(0, 12)}\`)`, ''];
  if (!results.length) { return [...lines, 'No changed schema files matched.', ''].join('\n'); }
  lines.push('| File | Verdict |', '| --- | --- |');
  for (const r of results) {
    // A `|` in a path would end the table cell early, even inside a code span.
    const name = (r.kind === 'R' ? `${r.oldPath} → ${r.path}` : r.path).replace(/\|/g, '\\|');
    lines.push(`| \`${name}\` | ${ICON[r.verdict]} ${r.verdict} |`);
  }
  lines.push('');
  for (const r of results) {
    lines.push(`<details><summary>${escapeHtml(r.path)}</summary>`, '', `<pre>${escapeHtml(r.report)}</pre>`, '', '</details>', '');
  }
  return lines.join('\n');
}

function main() {
  const base = (process.env.GATE_BASE ?? '').trim();
  const strict = (process.env.GATE_STRICT ?? '').trim().toLowerCase() === 'true';
  const cli = process.env.GATE_CLI;
  const patterns = (process.env.GATE_SCHEMAS ?? '').split('\n').map(s => s.trim()).filter(Boolean);
  const globs = (patterns.length ? patterns : DEFAULT_SCHEMAS).map(globToRegExp);
  const setOutput = (k, v) => { if (process.env.GITHUB_OUTPUT) { appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); } };
  const summarise = md => { if (process.env.GITHUB_STEP_SUMMARY) { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`); } };

  if (!cli) { console.error('compat-gate: GATE_CLI is not set.'); return 64; }
  if (!base || /^0+$/.test(base)) {
    console.log('compat-gate: no base commit (first push of a branch?) — nothing to compare.');
    summarise('## JSON Schema compatibility gate\n\nNo base commit to compare against.');
    setOutput('verdict', 'compatible');
    return 0;
  }

  ensureBase(base);
  const matches = p => globs.some(g => g.test(p));
  const changes = parseNameStatus(git('diff', '--name-status', '-M', base, 'HEAD'))
    .filter(c => ['A', 'M', 'R', 'D'].includes(c.kind) && (matches(c.path) || matches(c.oldPath)));

  const scratch = mkdtempSync(join(tmpdir(), 'compat-gate-'));
  let results;
  try {
    // One file that cannot be read is that file's error, not a crash that
    // loses every other file's verdict and the job summary.
    results = changes.map(c => {
      try { return compare(cli, base, c, strict, scratch); } catch (e) {
        return { ...c, verdict: 'error', report: `Could not compare: ${e instanceof Error ? e.message : String(e)}` };
      }
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const verdict = overall(results);
  const md = renderSummary(results, verdict, base);
  console.log(md);
  summarise(md);
  setOutput('verdict', verdict === 'error' ? 'breaking' : verdict);
  return { compatible: 0, breaking: 1, unknown: 2, error: 1 }[verdict];
}

process.exitCode = main();
