import * as assert from 'assert';

const { diffSchemas } = require('../../schemaDiff');
const {
  compatibilityVerdict,
  verdictExitCode,
  verdictHeadline,
  verdictVerb,
  renderCompatReport,
} = require('../../schemaCompat');

// Build real DiffEntry sets by running F15's classifier on schema pairs.
const addedRequired = () =>
  diffSchemas({ type: 'object', required: ['a'] }, { type: 'object', required: ['a', 'b'] });
const addedOptional = () =>
  diffSchemas({ properties: { a: {} } }, { properties: { a: {}, b: {} } });
const identical = () => diffSchemas({ type: 'object' }, { type: 'object' });

suite('[F26-FR-01][F26-NFR-01][F26-NFR-02] compatibilityVerdict() — counts & compatibility', () => {
  test('a new required name is breaking → not compatible', () => {
    const v = compatibilityVerdict(addedRequired());
    assert.strictEqual(v.breaking, 1);
    assert.strictEqual(v.compatible, false);
  });

  test('an added optional property is compatible', () => {
    const v = compatibilityVerdict(addedOptional());
    assert.strictEqual(v.breaking, 0);
    assert.strictEqual(v.compatible, true);
    assert.ok(v.nonBreaking >= 1);
  });

  test('no changes is compatible', () => {
    assert.strictEqual(compatibilityVerdict(identical()).compatible, true);
  });
});

suite('[F26-FR-02] compatibilityVerdict() — strict mode', () => {
  // additionalProperties changing between two non-boolean, non-object values is
  // classified "unclassified" by F15.
  const unclassified = () =>
    diffSchemas({ additionalProperties: 1 }, { additionalProperties: 2 });

  test('unclassified is compatible by default but not under strict', () => {
    const entries = unclassified();
    assert.ok(compatibilityVerdict(entries).unclassified >= 1, 'sanity: produces an unclassified change');
    assert.strictEqual(compatibilityVerdict(entries, { strict: false }).compatible, true);
    assert.strictEqual(compatibilityVerdict(entries, { strict: true }).compatible, false);
  });
});

suite('[F26-FR-03] verdictExitCode()', () => {
  test('0 compatible, 1 breaking, 2 strict-unknown', () => {
    assert.strictEqual(verdictExitCode(compatibilityVerdict(addedOptional())), 0);
    assert.strictEqual(verdictExitCode(compatibilityVerdict(addedRequired())), 1);
    const unknownStrict = compatibilityVerdict(
      diffSchemas({ additionalProperties: 1 }, { additionalProperties: 2 }),
      { strict: true },
    );
    assert.strictEqual(verdictExitCode(unknownStrict), 2);
  });

  test('breaking outranks strict-unknown (exit 1)', () => {
    // Both a breaking and an unclassified change present, strict on → still 1.
    const entries = diffSchemas(
      { required: ['a'], additionalProperties: 1 },
      { required: ['a', 'b'], additionalProperties: 2 },
    );
    assert.strictEqual(verdictExitCode(compatibilityVerdict(entries, { strict: true })), 1);
  });
});

suite('[F26-FR-04] verdictHeadline() / verdictVerb() / renderCompatReport()', () => {
  test('headline names the breaking count and the verb flips', () => {
    assert.match(verdictHeadline(compatibilityVerdict(addedRequired())), /NOT backward-compatible — 1 breaking/);
    assert.match(verdictHeadline(compatibilityVerdict(addedOptional())), /✅ Backward-compatible/);
    assert.strictEqual(verdictVerb(compatibilityVerdict(addedRequired())), 'NOT backward-compatible');
    assert.strictEqual(verdictVerb(compatibilityVerdict(addedOptional())), 'backward-compatible');
  });

  test('strict headline flags unclassified changes', () => {
    const entries = diffSchemas({ additionalProperties: 1 }, { additionalProperties: 2 });
    assert.match(verdictHeadline(compatibilityVerdict(entries, { strict: true })), /Compatibility unknown/);
  });

  test('report leads with the verdict then the grouped F15 change list', () => {
    const md = renderCompatReport(addedRequired(), 'new.json vs old.json');
    assert.match(md, /^⛔ NOT backward-compatible/);
    assert.match(md, /## Breaking \(1\)/);
    assert.match(md, /`\/required`/);
  });

  test('report handles the no-change case', () => {
    const md = renderCompatReport(identical(), 'x vs x');
    assert.match(md, /✅ Backward-compatible/);
    assert.match(md, /No structural changes/);
  });
});
