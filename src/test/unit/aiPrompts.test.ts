import * as assert from 'assert';
import fc from 'fast-check';

const {
  describePropertiesPrompt,
  draftSchemaPrompt,
  enrichSchemaPrompt,
  explainDiagnosticPrompt,
  sampleDataPrompt,
  migrationNotesPrompt,
  problemsBlock,
} = require('../../ai/prompts');

const SCHEMA = '{"type":"object","properties":{"name":{"type":"string"}}}';

suite('[F32-FR-13][S20-SR-07] prompts carry only the artifacts the command operates on', () => {
  // S20-SR-07: what may be sent is bounded by what these builders take as
  // parameters. A path, a credential or an unrelated file cannot appear in a
  // prompt because there is no parameter through which it could arrive.
  const forbidden = [/\/home\//, /C:\\\\/, /Bearer /i, /ghp_[A-Za-z0-9]/, /password/i];

  const allPrompts = (): string[] => [
    describePropertiesPrompt(SCHEMA, 'person.schema.json'),
    draftSchemaPrompt('an order with line items'),
    enrichSchemaPrompt(SCHEMA, 'inferred.json'),
    explainDiagnosticPrompt({ message: 'must be string', value: '42', subschema: SCHEMA, fileName: 'a.json' }),
    sampleDataPrompt({ schemaText: SCHEMA, count: 3, adversarial: false }),
    migrationNotesPrompt({ report: '# diff', verdict: 'NOT backward-compatible', fileName: 'a.json' }),
  ];

  test('no prompt leaks a path, credential or secret-shaped string', () => {
    for (const prompt of allPrompts()) {
      for (const pattern of forbidden) {
        assert.doesNotMatch(prompt, pattern, `a prompt matched ${pattern}`);
      }
    }
  });

  test('every prompt names only the base file name it was given', () => {
    const prompt = describePropertiesPrompt(SCHEMA, 'person.schema.json');
    assert.match(prompt, /person\.schema\.json/);
    assert.ok(!prompt.includes('/'), 'no path separator reaches the prompt');
  });

  test('long inputs are truncated rather than sent whole', () => {
    const huge = `{"a":"${'x'.repeat(60_000)}"}`;
    const prompt = describePropertiesPrompt(huge, 'big.json');
    assert.ok(prompt.length < 30_000, `expected truncation, prompt was ${prompt.length} chars`);
    assert.match(prompt, /truncated/);
  });
});

suite('[F32-FR-07] describePropertiesPrompt', () => {
  test('states the task and the no-other-changes constraint', () => {
    const prompt = describePropertiesPrompt(SCHEMA, 'p.json');
    assert.match(prompt, /"description"/);
    assert.match(prompt, /Change NOTHING else/);
    assert.ok(prompt.includes(SCHEMA));
  });

  test('states that the result is verified automatically', () => {
    assert.match(describePropertiesPrompt(SCHEMA, 'p.json'), /verified automatically/);
  });
});

suite('[F32-FR-09] draftSchemaPrompt', () => {
  test('carries the description and asks for a complete schema', () => {
    const prompt = draftSchemaPrompt('an order with line items');
    assert.match(prompt, /an order with line items/);
    assert.match(prompt, /required/);
    assert.match(prompt, /additionalProperties/);
  });

  test('clips an absurdly long description', () => {
    assert.ok(draftSchemaPrompt('x'.repeat(10_000)).length < 6_000);
  });
});

suite('[F32-FR-10] enrichSchemaPrompt', () => {
  test('asks for additive refinement only', () => {
    const prompt = enrichSchemaPrompt(SCHEMA, 'inferred.json');
    assert.match(prompt, /format/);
    assert.match(prompt, /enum/);
    assert.match(prompt, /\$defs/);
    assert.match(prompt, /Never remove a property/);
  });
});

suite('[F32-FR-08] explainDiagnosticPrompt', () => {
  test('carries the finding, the value and the subschema, and asks for prose', () => {
    const prompt = explainDiagnosticPrompt({
      message: 'must match pattern', value: '"PROD"', subschema: SCHEMA, fileName: 'a.json',
    });
    assert.match(prompt, /must match pattern/);
    assert.match(prompt, /"PROD"/);
    assert.match(prompt, /plain prose/);
    assert.match(prompt, /no code fences/);
  });
});

suite('[F32-FR-11] sampleDataPrompt', () => {
  test('asks for realistic instances by default', () => {
    const prompt = sampleDataPrompt({ schemaText: SCHEMA, count: 5, adversarial: false });
    assert.match(prompt, /SATISFY/);
    assert.match(prompt, /5 instances/);
    assert.doesNotMatch(prompt, /VIOLATE/);
  });

  test('asks for plausible violations in adversarial mode', () => {
    const prompt = sampleDataPrompt({ schemaText: SCHEMA, count: 3, adversarial: true });
    assert.match(prompt, /VIOLATE/);
    assert.match(prompt, /realistically write by mistake/);
  });

  test('tells the model its output is gated either way', () => {
    for (const adversarial of [true, false]) {
      assert.match(sampleDataPrompt({ schemaText: SCHEMA, count: 2, adversarial }), /discarded/);
    }
  });
});

suite('[F32-FR-12] migrationNotesPrompt', () => {
  test('carries the computed diff and verdict as fact', () => {
    const prompt = migrationNotesPrompt({
      report: '# Changes\n- required added', verdict: 'NOT backward-compatible', fileName: 'api.json',
    });
    assert.match(prompt, /NOT backward-compatible/);
    assert.match(prompt, /required added/);
    assert.match(prompt, /do not re-derive or dispute/);
    assert.match(prompt, /backward-compatible alternative/);
  });
});

suite('[F32-FR-04] problemsBlock — retry feedback', () => {
  test('is empty on the first attempt', () => {
    assert.strictEqual(problemsBlock([]), '');
  });

  test('lists the rejections and asks for exactly those fixes', () => {
    const block = problemsBlock([{ stage: 'compile', message: 'bad type' }]);
    assert.match(block, /rejected by the automatic checks/);
    assert.match(block, /\[compile\] bad type/);
    assert.match(block, /Fix exactly these problems/);
  });

  test('is appended to every retryable prompt', () => {
    const problems = [{ stage: 'lint', message: 'duplicate enum' }];
    for (const prompt of [
      describePropertiesPrompt(SCHEMA, 'p.json', problems),
      draftSchemaPrompt('x', problems),
      enrichSchemaPrompt(SCHEMA, 'p.json', problems),
      sampleDataPrompt({ schemaText: SCHEMA, count: 1, adversarial: false, problems }),
    ]) {
      assert.match(prompt, /duplicate enum/);
    }
  });
});

suite('[F32-NFR-01] prompt builders are total', () => {
  test('never throw for arbitrary inputs', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (text, name) => {
        describePropertiesPrompt(text, name);
        draftSchemaPrompt(text);
        enrichSchemaPrompt(text, name);
        explainDiagnosticPrompt({ message: text, value: text, subschema: text, fileName: name });
        sampleDataPrompt({ schemaText: text, count: 1, adversarial: false });
        migrationNotesPrompt({ report: text, verdict: text, fileName: name });
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
