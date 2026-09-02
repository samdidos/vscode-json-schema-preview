import * as assert from 'assert';
import * as path from 'path';
import fc from 'fast-check';

const { isInsideRoot, resolveWithin, outsideRootMessage } = require('../../pathSafety');

const ROOT = path.resolve('/w');

suite('[F29-FR-14] isInsideRoot — containment', () => {
  test('accepts paths strictly inside the root', () => {
    assert.strictEqual(isInsideRoot(ROOT, path.resolve('/w/a.json')), true);
    assert.strictEqual(isInsideRoot(ROOT, path.resolve('/w/nested/deep/a.json')), true);
  });

  test('rejects the root itself, so naming the directory cannot satisfy the check', () => {
    assert.strictEqual(isInsideRoot(ROOT, ROOT), false);
  });

  test('rejects an escape, however it is spelled', () => {
    for (const target of ['/etc/passwd', '/w/../etc/passwd', '/w/a/../../etc/passwd', '/wxyz/a.json']) {
      assert.strictEqual(isInsideRoot(ROOT, target), false, `${target} must be refused`);
    }
  });

  test('resolves both sides, so a relative root still works', () => {
    assert.strictEqual(isInsideRoot('/w/./sub/..', path.resolve('/w/a.json')), true);
  });
});

suite('[F29-FR-14] resolveWithin — document-supplied paths', () => {
  test('resolves a fixture beside the suite', () => {
    assert.strictEqual(resolveWithin(ROOT, '/w/contracts', './ada.json'), path.resolve('/w/contracts/ada.json'));
  });

  test('allows climbing to a sibling directory inside the root', () => {
    // A suite in contracts/ referencing ../schemas/x.json is legitimate.
    assert.strictEqual(resolveWithin(ROOT, '/w/contracts', '../schemas/x.json'), path.resolve('/w/schemas/x.json'));
  });

  test('refuses an escape past the root', () => {
    assert.strictEqual(resolveWithin(ROOT, '/w/contracts', '../../../../etc/passwd'), undefined);
    assert.strictEqual(resolveWithin(ROOT, '/w', '../secrets.json'), undefined);
  });

  test('refuses an absolute path that would discard the base directory', () => {
    // path.resolve() drops baseDir entirely for an absolute second argument —
    // exactly the escape the containment check exists to catch.
    assert.strictEqual(resolveWithin(ROOT, '/w/contracts', '/etc/passwd'), undefined);
  });

  test('accepts an absolute path that already lies inside the root', () => {
    assert.strictEqual(resolveWithin(ROOT, '/w/contracts', path.resolve('/w/a.json')), path.resolve('/w/a.json'));
  });

  test('refuses an empty path', () => {
    assert.strictEqual(resolveWithin(ROOT, '/w', ''), undefined);
  });

  test('never resolves outside the root, for any input', () => {
    fc.assert(
      fc.property(fc.string(), relative => {
        const resolved = resolveWithin(ROOT, '/w/contracts', relative);
        return resolved === undefined || isInsideRoot(ROOT, resolved);
      }),
      { numRuns: 500 },
    );
  });

  test('the refusal message names the offending path', () => {
    assert.match(outsideRootMessage('../../etc/passwd'), /"\.\.\/\.\.\/etc\/passwd"/);
    assert.match(outsideRootMessage('x'), /outside the workspace/);
  });
});
