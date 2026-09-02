import * as assert from 'assert';
import fc from 'fast-check';

const {
  parseTestSuite,
  runTestSuite,
  isSuitePath,
  renderSuiteReport,
} = require('../../schemaTests');

const PERSON = {
  type: 'object',
  properties: { name: { type: 'string' }, age: { type: 'integer' } },
  required: ['name'],
  additionalProperties: false,
};

const parseOk = (value: unknown) => {
  const result = parseTestSuite(value);
  assert.ok(result.ok, `expected a parseable suite, got ${JSON.stringify(result.problems)}`);
  return result.suite;
};

const parseFail = (value: unknown) => {
  const result = parseTestSuite(value);
  assert.ok(!result.ok, 'expected the suite to be rejected');
  return result.problems as Array<{ message: string; pointer: string }>;
};

suite('[F29-FR-01] parseTestSuite() — suite shape', () => {
  test('accepts a suite declaring schema and both case lists', () => {
    const suite_ = parseOk({ schema: './p.json', valid: [{}], invalid: [{}] });
    assert.strictEqual(suite_.schemaRef, './p.json');
    assert.strictEqual(suite_.cases.length, 2);
  });

  test('carries an optional description through', () => {
    assert.strictEqual(parseOk({ schema: './p.json', valid: [], description: 'hi' }).description, 'hi');
  });

  test('rejects a suite with no schema', () => {
    assert.match(parseFail({ valid: [] })[0].message, /must declare "schema"/);
  });

  test('rejects a suite with a blank schema', () => {
    assert.match(parseFail({ schema: '   ', valid: [] })[0].message, /must declare "schema"/);
  });

  test('rejects a suite with neither valid nor invalid', () => {
    assert.match(parseFail({ schema: './p.json' })[0].message, /at least one of/);
  });

  test('rejects a non-object suite', () => {
    for (const value of [null, 42, 'x', [], undefined]) {
      assert.match(parseFail(value)[0].message, /must be a JSON object/);
    }
  });
});

suite('[F29-FR-02] parseTestSuite() — descriptor vs bare instance', () => {
  test('treats an object with "instance" as a descriptor', () => {
    const [c] = parseOk({ schema: 's', valid: [{ name: 'n', instance: { a: 1 } }] }).cases;
    assert.deepStrictEqual(c.instance, { a: 1 });
    assert.strictEqual(c.name, 'n');
  });

  test('treats an object with "file" as a descriptor', () => {
    const [c] = parseOk({ schema: 's', valid: [{ file: './a.json' }] }).cases;
    assert.strictEqual(c.file, './a.json');
  });

  test('treats an object carrying only "name" as a bare instance, not metadata', () => {
    // The discriminator is instance/file — so a document that happens to have a
    // `name` property is never misread as a case descriptor.
    const [c] = parseOk({ schema: 's', valid: [{ name: 'Ada' }] }).cases;
    assert.deepStrictEqual(c.instance, { name: 'Ada' });
    assert.strictEqual(c.name, 'valid[0]');
  });

  test('treats scalars and arrays as bare instances', () => {
    const cases = parseOk({ schema: 's', valid: [42, 'x', null, [1, 2]] }).cases;
    assert.deepStrictEqual(cases.map((c: { instance: unknown }) => c.instance), [42, 'x', null, [1, 2]]);
  });

  test('rejects a descriptor whose "file" is not a string', () => {
    // `file` present makes it a descriptor, but a non-string leaves it with no
    // usable instance source.
    const problems = parseFail({ schema: 's', valid: [{ file: 42 }] });
    assert.ok(problems.some(p => /neither "instance" nor "file"/.test(p.message)));
  });

  test('an object carrying only name/errors is a bare instance, not a broken descriptor', () => {
    const [c] = parseOk({ schema: 's', valid: [{ name: 'x', errors: ['type'] }] }).cases;
    assert.deepStrictEqual(c.instance, { name: 'x', errors: ['type'] });
  });

  test('rejects a non-array case list', () => {
    assert.match(parseFail({ schema: 's', valid: {} })[0].message, /must be an array/);
  });

  test('rejects a non-string-array "errors"', () => {
    assert.match(
      parseFail({ schema: 's', invalid: [{ instance: {}, errors: [1] }] })[0].message,
      /array of keyword strings/,
    );
  });

  test('rejects "errors" on a valid case', () => {
    assert.match(
      parseFail({ schema: 's', valid: [{ instance: {}, errors: ['type'] }] })[0].message,
      /meaningless on a valid case/,
    );
  });
});

suite('[F29-FR-03] parseTestSuite() — case naming and pointers', () => {
  test('falls back to a positional label and records the pointer', () => {
    const cases = parseOk({ schema: 's', valid: [1, 2], invalid: [3] }).cases;
    assert.deepStrictEqual(cases.map((c: { name: string }) => c.name), ['valid[0]', 'valid[1]', 'invalid[0]']);
    assert.deepStrictEqual(cases.map((c: { pointer: string }) => c.pointer), ['/valid/0', '/valid/1', '/invalid/0']);
  });

  test('ignores a blank name in favour of the positional label', () => {
    assert.strictEqual(parseOk({ schema: 's', valid: [{ name: '  ', instance: 1 }] }).cases[0].name, 'valid[0]');
  });
});

suite('[F29-FR-04][F29-NFR-01] parseTestSuite() — totality', () => {
  test('reports every problem, not only the first', () => {
    const problems = parseFail({ valid: {}, invalid: 3 });
    assert.ok(problems.length >= 3, `expected several problems, got ${problems.length}`);
  });

  test('never throws on arbitrary JSON input', () => {
    fc.assert(
      fc.property(fc.jsonValue(), value => {
        parseTestSuite(value);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

suite('[F29-FR-05] runTestSuite() — schema compilation', () => {
  test('fails every case with the compile error when the schema is invalid', () => {
    const suite_ = parseOk({ schema: 's', valid: [1, 2] });
    const result = runTestSuite(suite_, { type: 'not-a-type' });
    assert.strictEqual(result.failed, 2);
    assert.strictEqual(result.passed, 0);
    assert.ok(result.schemaError);
    assert.ok(result.cases.every((c: { message: string }) => /does not compile/.test(c.message)));
  });

  test('uses the draft-matching dialect so newer keywords are enforced', () => {
    const suite_ = parseOk({
      schema: 's',
      invalid: [{ instance: ['a', 2], errors: ['type'] }],
    });
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'string' }],
    };
    assert.strictEqual(runTestSuite(suite_, schema).passed, 1);
  });
});

suite('[F29-FR-06] runTestSuite() — valid cases', () => {
  test('passes an instance the schema accepts', () => {
    const suite_ = parseOk({ schema: 's', valid: [{ instance: { name: 'Ada' } }] });
    assert.strictEqual(runTestSuite(suite_, PERSON).passed, 1);
  });

  test('fails an instance the schema rejects, naming the errors', () => {
    const suite_ = parseOk({ schema: 's', valid: [{ instance: {} }] });
    const [c] = runTestSuite(suite_, PERSON).cases;
    assert.strictEqual(c.passed, false);
    assert.match(c.message, /Expected valid/);
    assert.match(c.message, /name/);
  });
});

suite('[F29-FR-07] runTestSuite() — invalid cases and keyword matching', () => {
  test('passes when the instance is rejected and no keywords are declared', () => {
    const suite_ = parseOk({ schema: 's', invalid: [{ instance: {} }] });
    assert.strictEqual(runTestSuite(suite_, PERSON).passed, 1);
  });

  test('fails when the instance validates cleanly', () => {
    const suite_ = parseOk({ schema: 's', invalid: [{ instance: { name: 'Ada' } }] });
    const [c] = runTestSuite(suite_, PERSON).cases;
    assert.strictEqual(c.passed, false);
    assert.match(c.message, /validated cleanly/);
  });

  test('passes when every declared keyword was reported', () => {
    const suite_ = parseOk({ schema: 's', invalid: [{ instance: {}, errors: ['required'] }] });
    assert.strictEqual(runTestSuite(suite_, PERSON).passed, 1);
  });

  test('fails, naming what was reported, when a declared keyword is absent', () => {
    // The case fails for the wrong reason — `required`, not `type` — which is
    // exactly what F29-FR-07 exists to catch.
    const suite_ = parseOk({ schema: 's', invalid: [{ instance: {}, errors: ['type'] }] });
    const [c] = runTestSuite(suite_, PERSON).cases;
    assert.strictEqual(c.passed, false);
    assert.match(c.message, /"type"/);
    assert.match(c.message, /reported "required"/);
  });

  test('requires all declared keywords, not just one', () => {
    const suite_ = parseOk({
      schema: 's',
      invalid: [{ instance: { age: 'x' }, errors: ['required', 'type', 'maximum'] }],
    });
    const [c] = runTestSuite(suite_, PERSON).cases;
    assert.strictEqual(c.passed, false);
    assert.match(c.message, /"maximum"/);
  });

  test('reports "none" when the instance produced no errors at all', () => {
    const suite_ = parseOk({ schema: 's', invalid: [{ instance: { name: 'Ada' }, errors: ['type'] }] });
    assert.match(runTestSuite(suite_, PERSON).cases[0].message, /validated cleanly/);
  });
});

suite('[F29-FR-08][F29-NFR-02] runTestSuite() — fixture loading', () => {
  test('loads an instance from a file through the injected loader', () => {
    const suite_ = parseOk({ schema: 's', valid: [{ file: './ada.json' }] });
    const result = runTestSuite(suite_, PERSON, { loadInstance: () => ({ name: 'Ada' }) });
    assert.strictEqual(result.passed, 1);
  });

  test('fails only that case when the fixture cannot be read', () => {
    const suite_ = parseOk({ schema: 's', valid: [{ file: './missing.json' }, { instance: { name: 'Ada' } }] });
    const result = runTestSuite(suite_, PERSON, {
      loadInstance: () => { throw new Error('ENOENT'); },
    });
    assert.strictEqual(result.passed, 1);
    assert.strictEqual(result.failed, 1);
    assert.match(result.cases[0].message, /ENOENT/);
  });

  test('fails a file case when no loader is available', () => {
    const suite_ = parseOk({ schema: 's', valid: [{ file: './ada.json' }] });
    assert.match(runTestSuite(suite_, PERSON).cases[0].message, /no fixture loader/);
  });
});

suite('[F29-FR-09] runTestSuite() — totals and ordering', () => {
  test('reports totals and preserves declaration order', () => {
    const suite_ = parseOk({
      schema: 's',
      valid: [{ name: 'a', instance: { name: 'Ada' } }, { name: 'b', instance: {} }],
      invalid: [{ name: 'c', instance: {} }],
    });
    const result = runTestSuite(suite_, PERSON);
    assert.deepStrictEqual(result.cases.map((c: { name: string }) => c.name), ['a', 'b', 'c']);
    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.passed, 2);
    assert.strictEqual(result.failed, 1);
  });

  test('never throws for arbitrary instances against a real schema', () => {
    fc.assert(
      fc.property(fc.array(fc.jsonValue(), { maxLength: 5 }), instances => {
        const suite_ = parseOk({ schema: 's', valid: instances.length ? instances : [null] });
        runTestSuite(suite_, PERSON);
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

suite('[F29-FR-12] isSuitePath() — discovery', () => {
  test('matches suite file names and nothing else', () => {
    assert.ok(isSuitePath('/a/person.schema.test.json'));
    assert.ok(isSuitePath('/a/person.schema.test.jsonc'));
    assert.ok(!isSuitePath('/a/person.schema.json'));
    assert.ok(!isSuitePath('/a/person.test.json'));
    assert.ok(!isSuitePath('/a/schema.test.yaml'));
  });
});

suite('[F29-FR-13] renderSuiteReport() — report', () => {
  test('celebrates a fully passing suite', () => {
    const suite_ = parseOk({ schema: 's', valid: [{ instance: { name: 'Ada' } }] });
    const report = renderSuiteReport(runTestSuite(suite_, PERSON), 'person');
    assert.match(report, /1 \/ 1 cases passed/);
    assert.match(report, /Every case passed/);
  });

  test('lists failing cases with their reasons', () => {
    const suite_ = parseOk({ schema: 's', valid: [{ name: 'empty', instance: {} }] });
    const report = renderSuiteReport(runTestSuite(suite_, PERSON), 'person');
    assert.match(report, /Failing cases \(1\)/);
    assert.match(report, /\*\*empty\*\*/);
  });

  test('leads with the compile error when the schema is broken', () => {
    const suite_ = parseOk({ schema: 's', valid: [1] });
    const report = renderSuiteReport(runTestSuite(suite_, { type: 'nope' }), 'person');
    assert.match(report, /Schema did not compile/);
  });
});

suite('[F20-FR-09] workspace sweep — suites as a third artifact', () => {
  const { summarize, summaryLine, renderMarkdownReport } = require('../../workspaceValidation');

  const suiteResult = (failures: number) => ({
    relPath: 'a.schema.test.json', folder: '', kind: 'suite' as const,
    status: failures ? 'errors' as const : 'valid' as const,
    issues: Array.from({ length: failures }, (_, i) => ({ message: `case ${i} failed` })),
  });

  test('counts suites and failing cases separately from data files', () => {
    const summary = summarize([
      { relPath: 'd.json', folder: '', kind: 'data', status: 'valid', issues: [] },
      suiteResult(2),
      suiteResult(0),
    ]);
    assert.strictEqual(summary.filesChecked, 1, 'suites are not counted as data files');
    assert.strictEqual(summary.suitesRun, 2);
    assert.strictEqual(summary.casesFailed, 2);
  });

  test('the summary line mentions suites only when the workspace has any', () => {
    const meta = { truncated: false, maxFiles: 100, untrusted: false, skippedLarge: 0 };
    const without = summaryLine(summarize([
      { relPath: 'd.json', folder: '', kind: 'data', status: 'valid', issues: [] },
    ]), meta);
    assert.doesNotMatch(without, /test suite/);

    const with_ = summaryLine(summarize([suiteResult(1)]), meta);
    assert.match(with_, /1 test suite run/);
    assert.match(with_, /1 case failed/);
  });

  test('the Markdown report gains a suite line when suites ran', () => {
    const meta = { truncated: false, maxFiles: 100, untrusted: false, skippedLarge: 0 };
    const report = renderMarkdownReport([suiteResult(3)], meta);
    assert.match(report, /\*\*1\*\* schema test suite\(s\) run — \*\*3\*\* case\(s\) failed/);
    assert.doesNotMatch(renderMarkdownReport([], meta), /schema test suite/);
  });
});
