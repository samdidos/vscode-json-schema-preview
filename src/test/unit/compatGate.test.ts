// F26-FR-09..11 — the compat-gate GitHub Action. gate.mjs runs end to end in a
// throwaway git repository, against a stub CLI whose exit code is driven by the
// new schema's content, so these tests pin the action's own logic (selection,
// renames, deletions, summary, exit code) independently of the classifier.
import * as assert from 'assert';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../');
const GATE = path.join(ROOT, 'compat-gate', 'gate.mjs');
const ACTION = path.join(ROOT, 'compat-gate', 'action.yml');

/** Stand-in for `jstk diff <old> <new> --check [--strict]`: breaking when the
 *  new file says BREAK, unknown (only with --strict) when it says UNKNOWN. */
const STUB_CLI = `
const fs = require('fs');
const [, , cmd, oldFile, newFile, ...flags] = process.argv;
if (cmd !== 'diff' || !flags.includes('--check')) { process.exit(64); }
fs.readFileSync(oldFile);
const text = fs.readFileSync(newFile, 'utf-8');
if (text.includes('BREAK')) { console.log('BREAKING ' + newFile); process.exit(1); }
if (text.includes('UNKNOWN') && flags.includes('--strict')) { console.log('UNKNOWN'); process.exit(2); }
if (text.includes('BAD')) { console.error('cannot parse'); process.exit(65); }
console.log('compatible <&>');
`;

interface Run { code: number | null; stdout: string; summary: string; output: string }

suite('[F26-FR-09] compat-gate action — changed schemas against the base', () => {
  let repo: string;
  let base: string;
  const git = (...args: string[]) => execFileSync('git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf-8' }).trim();
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  };

  setup(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
    git('init', '-q');
    write('cli.js', STUB_CLI);
    write('api.schema.json', '{}');
    write('nested/deep/item.schema.yaml', 'a: 1');
    // Distinct contents, so git's rename detection pairs the right files.
    write('old.schema.json', '{"title":"old"}');
    write('gone.schema.json', '{"title":"gone"}');
    write('other.json', '{}');
    git('add', '-A');
    git('commit', '-qm', 'base');
    base = git('rev-parse', 'HEAD');
  });
  teardown(() => fs.rmSync(repo, { recursive: true, force: true }));

  const commit = () => { git('add', '-A'); git('commit', '-qm', 'change'); };
  const run = (env: Record<string, string> = {}): Run => {
    const summaryFile = path.join(repo, '.summary');
    const outputFile = path.join(repo, '.output');
    const r = spawnSync(process.execPath, [GATE], {
      cwd: repo, encoding: 'utf-8',
      env: {
        ...process.env, GATE_BASE: base, GATE_CLI: path.join(repo, 'cli.js'), GATE_SCHEMAS: '', GATE_STRICT: 'false',
        GITHUB_STEP_SUMMARY: summaryFile, GITHUB_OUTPUT: outputFile, ...env,
      },
    });
    const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : '');
    return { code: r.status, stdout: r.stdout, summary: read(summaryFile), output: read(outputFile) };
  };

  test('compares only changed files that match the default globs, at any depth', () => {
    write('api.schema.json', '{"ok":1}');
    write('nested/deep/item.schema.yaml', 'a: 2');
    write('other.json', '{"BREAK":1}');
    commit();
    const r = run();
    assert.strictEqual(r.code, 0, r.stdout);
    assert.match(r.summary, /\| `api\.schema\.json` \| ✅ compatible \|/);
    assert.match(r.summary, /\| `nested\/deep\/item\.schema\.yaml` \| ✅ compatible \|/);
    assert.doesNotMatch(r.summary, /other\.json/, 'a non-schema file is not compared');
    assert.strictEqual(r.output, 'verdict=compatible\n');
  });

  test('honours custom globs', () => {
    write('other.json', '{"BREAK":1}');
    commit();
    const r = run({ GATE_SCHEMAS: 'other.json\n' });
    assert.strictEqual(r.code, 1);
    assert.match(r.summary, /other\.json/);
  });

  test('compares a renamed file with its old path, lists new files, and counts deletions as breaking', () => {
    git('mv', 'old.schema.json', 'renamed.schema.json');
    git('rm', '-q', 'gone.schema.json');
    write('fresh.schema.json', '{"BREAK":1}');
    commit();
    const r = run();
    assert.match(r.summary, /\| `old\.schema\.json → renamed\.schema\.json` \| ✅ compatible \|/);
    assert.match(r.summary, /\| `fresh\.schema\.json` \| 🆕 new \|/, 'a new schema is never compared');
    assert.match(r.summary, /\| `gone\.schema\.json` \| ⛔ breaking \|/);
    assert.strictEqual(r.code, 1);
  });

  test('escapes a `|` in a file name so the summary table keeps its columns', function () {
    if (process.platform === 'win32') { this.skip(); } // `|` is not a legal Windows file name character
    write('we|ird.schema.json', '{}');
    commit();
    const r = run();
    assert.match(r.summary, /\| `we\\\|ird\.schema\.json` \| 🆕 new \|/);
  });

  test('passes when there is no base commit to compare against', () => {
    const r = run({ GATE_BASE: '0000000000000000000000000000000000000000' });
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.output, 'verdict=compatible\n');
  });
});

suite('[F26-FR-10] compat-gate action — verdict, summary, exit code', () => {
  let repo: string;
  let base: string;
  const git = (...args: string[]) => execFileSync('git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf-8' }).trim();

  setup(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
    git('init', '-q');
    fs.writeFileSync(path.join(repo, 'cli.js'), STUB_CLI);
    fs.writeFileSync(path.join(repo, 'a.schema.json'), '{}');
    git('add', '-A');
    git('commit', '-qm', 'base');
    base = git('rev-parse', 'HEAD');
  });
  teardown(() => fs.rmSync(repo, { recursive: true, force: true }));

  const change = (text: string, env: Record<string, string> = {}) => {
    fs.writeFileSync(path.join(repo, 'a.schema.json'), text);
    git('commit', '-qam', 'change');
    const summary = path.join(repo, '.summary');
    const output = path.join(repo, '.output');
    fs.rmSync(summary, { force: true });
    fs.rmSync(output, { force: true });
    const r = spawnSync(process.execPath, [GATE], {
      cwd: repo, encoding: 'utf-8',
      env: { ...process.env, GATE_BASE: base, GATE_CLI: path.join(repo, 'cli.js'), GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output, ...env },
    });
    return { code: r.status, summary: fs.readFileSync(summary, 'utf-8'), output: fs.readFileSync(output, 'utf-8') };
  };

  test('fails with exit 1 and verdict=breaking on a breaking change, headline first', () => {
    const r = change('{"BREAK":1}');
    assert.strictEqual(r.code, 1);
    assert.strictEqual(r.output, 'verdict=breaking\n');
    const lines = r.summary.split('\n').filter(Boolean);
    assert.match(lines[1], /NOT backward-compatible/);
  });

  test('an unclassified change passes by default but fails under strict with verdict=unknown', () => {
    assert.strictEqual(change('{"UNKNOWN":1}').code, 0);
    const strict = change('{"UNKNOWN":2}', { GATE_STRICT: 'true' });
    assert.strictEqual(strict.code, 2);
    assert.strictEqual(strict.output, 'verdict=unknown\n');
  });

  test('an unparseable schema fails the step rather than passing silently', () => {
    const r = change('{"BAD":1}');
    assert.strictEqual(r.code, 1);
    assert.match(r.summary, /could not be compared/);
  });

  test('compares a schema larger than Node\'s 1 MiB child-output default', () => {
    // A bundled schema easily passes 1 MiB; reading it back through `git show`
    // must not hit the default maxBuffer (ENOBUFS) and crash the gate.
    fs.writeFileSync(path.join(repo, 'a.schema.json'), JSON.stringify({ description: 'x'.repeat(3 * 1024 * 1024) }));
    git('commit', '-qam', 'large');
    base = git('rev-parse', 'HEAD');
    const r = change('{"fine":1}');
    assert.strictEqual(r.code, 0, r.summary);
    assert.strictEqual(r.output, 'verdict=compatible\n');
  });

  test('escapes each file\'s report into the summary', () => {
    const r = change('{"fine":1}');
    assert.match(r.summary, /<pre>compatible &lt;&amp;&gt;<\/pre>/);
  });
});

suite('[F26-FR-11] compat-gate action — wraps the CLI built from its own ref', () => {
  const action = fs.readFileSync(ACTION, 'utf-8');
  const gate = fs.readFileSync(GATE, 'utf-8');

  test('builds the CLI from the action checkout and points the gate at it', () => {
    assert.match(action, /working-directory: \$\{\{ github\.action_path \}\}\/\.\./);
    assert.match(action, /npm ci --ignore-scripts/);
    assert.match(action, /npm run build:cli/);
    assert.match(action, /GATE_CLI: \$\{\{ github\.action_path \}\}\/\.\.\/cli\/dist\/cli\.js/);
    assert.doesNotMatch(action, /npx|json-schema-toolkit@/, 'nothing is fetched from a registry at run time');
  });

  test('takes the Node version as an input, since that Node stays on the job\'s PATH', () => {
    assert.match(action, /^  node-version:\n/m);
    assert.match(action, /node-version: \$\{\{ inputs\.node-version \}\}/);
  });

  test('every action it uses is pinned to a commit SHA', () => {
    const directives = action.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
    for (const [, ref] of directives.matchAll(/uses: [^@\s]+@(\S+)/g)) {
      assert.match(ref, /^[0-9a-f]{40}$/);
    }
  });

  test('the glue imports only Node built-ins and runs the CLI\'s diff --check', () => {
    for (const [, spec] of gate.matchAll(/from '([^']+)'/g)) {
      assert.match(spec, /^node:/, `${spec} is not a Node built-in`);
    }
    assert.match(gate, /'diff', oldFile, change\.path, '--check'/);
  });

  test('ships outside the .vsix', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf-8').split('\n');
    assert.ok(ignore.includes('compat-gate/**'));
  });
});
