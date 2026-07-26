// S19 — defect attribution via the `Fixes:` commit trailer.
//
// The hook check is plain Node shared with .husky/commit-msg, so it is
// exercised directly here: these tests ARE the acceptance criteria, run
// against the real matrix rather than a fixture.
import * as assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const { checkMessage, parseFixesTrailers, EXEMPT_SCOPES, REQ_ID_RE } =
  require('../../../scripts/check-fix-trailer.mjs');

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const matrix = JSON.parse(read('specs/traceability.json'));
const known = new Set<string>(Object.keys(matrix.requirements));
const realId = [...known][0];

const check = (msg: string) => checkMessage(msg, known) as string[];

suite('S19 — defect attribution', () => {
  test('[S19-SR-01] a fix commit without a Fixes trailer is rejected', () => {
    const problems = check('fix(auth): treat a 404 as auth-required');
    assert.equal(problems.length, 1);
    assert.match(problems[0], /Fixes:/);
  });

  test('[S19-SR-01] a fix commit naming a real requirement passes', () => {
    assert.deepEqual(check(`fix(auth): thing\n\nFixes: ${realId}`), []);
  });

  test('[S19-SR-01] several requirements may be named, comma-separated', () => {
    const two = [...known].slice(0, 2);
    assert.deepEqual(check(`fix: thing\n\nFixes: ${two[0]}, ${two[1]}`), []);
    assert.deepEqual(parseFixesTrailers(`fix: t\n\nFixes: ${two[0]}, ${two[1]}`), two);
  });

  test('[S19-SR-02] a malformed id is rejected by name', () => {
    const problems = check('fix: thing\n\nFixes: nonsense');
    assert.equal(problems.length, 1);
    assert.match(problems[0], /"nonsense" is not a requirement id/);
  });

  test('[S19-SR-02] an id absent from the matrix is rejected by name', () => {
    const problems = check('fix: thing\n\nFixes: F99-FR-01');
    assert.equal(problems.length, 1);
    assert.match(problems[0], /"F99-FR-01" is not in specs\/traceability\.json/);
  });

  test('[S19-SR-02] the commit-msg hook runs the check', () => {
    const hook = read('.husky/commit-msg');
    assert.match(hook, /check-fix-trailer\.mjs/);
    assert.match(hook, /"\$1"/);
  });

  test('[S19-SR-03] fix(deps) is exempt; no other scope is', () => {
    assert.deepEqual(check('fix(deps): patch a high-severity advisory'), []);
    assert.deepEqual([...EXEMPT_SCOPES], ['deps']);
    assert.equal(check('fix(security): anchor a regex').length, 1);
  });

  test('[S19-SR-03] a non-fix commit is unaffected', () => {
    for (const msg of ['feat(x): add a thing', 'chore: tidy', 'docs: explain']) {
      assert.deepEqual(check(msg), [], `${msg} must not require a trailer`);
    }
  });

  test('[S19-SR-01] a commented-out trailer does not count', () => {
    // git strips `#` lines before storing the message, but the hook sees the
    // raw file — a trailer inside the template comment must not satisfy it.
    assert.equal(check('fix: thing\n# Fixes: F01-FR-01').length, 1);
  });

  test('[S19-NFR-01] the checker is plain Node with no third-party imports', () => {
    const script = read('scripts/check-fix-trailer.mjs');
    const imports = [...script.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(
        spec.startsWith('node:') || ['fs', 'path', 'url'].includes(spec),
        `unexpected dependency: ${spec}`,
      );
    }
  });

  test('[S19-NFR-02] the checker reads only the message and the matrix', () => {
    const script = read('scripts/check-fix-trailer.mjs');
    // No diff, no working tree: identical behaviour on commit, amend, rebase.
    assert.ok(!/execFileSync|execSync|spawn/.test(script), 'must not shell out to git');
    assert.match(script, /traceability\.json/);
  });

  test('[S19-SR-04] defect counts are derived from git at build time', () => {
    const loader = read('docs/.vitepress/defects.data.ts');
    assert.match(loader, /execFileSync/);
    assert.match(loader, /'git'/);
    assert.match(loader, /fixes:/i);
    // No committed tally anywhere that could disagree with the history.
    assert.ok(!/defects\.json/.test(loader), 'counts must not come from a committed file');
  });

  test('[S19-SR-05] unattributed fixes are counted, never inferred from files', () => {
    const loader = read('docs/.vitepress/defects.data.ts');
    assert.match(loader, /unattributed\+\+/);
    // The rejected approach must not sneak back in via impl-path matching.
    assert.ok(!/impl/.test(loader), 'attribution must not fall back to impl paths');
    // And the surface must show the unattributed count beside the counts.
    assert.match(read('docs/.vitepress/theme/SpecInsights.vue'), /defects\.unattributed/);
  });

  test('[S19-SR-01] the id pattern matches every requirement in the matrix', () => {
    for (const id of known) {
      assert.match(id, REQ_ID_RE as RegExp, `${id} must satisfy the trailer's id pattern`);
    }
  });
});
