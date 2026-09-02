import * as assert from 'assert';
import fc from 'fast-check';

const { extractJson, extractProse, unwrapFence } = require('../../ai/extract');
const {
  verifySchemaResponse,
  runVerifiedGeneration,
  describeProblems,
  onlyDescriptionsChanged,
  noPropertyLoss,
  DEFAULT_MAX_ATTEMPTS,
} = require('../../ai/verify');

interface Problem { stage: string; message: string }
type Verified =
  | { ok: true; schema: unknown; text: string }
  | { ok: false; problems: Problem[]; schema?: unknown; text?: string };

const stages = (result: Verified): string[] =>
  result.ok ? [] : (result as { problems: Problem[] }).problems.map(p => p.stage);

const GOOD_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Person',
  description: 'A person.',
  type: 'object',
  properties: { name: { type: 'string', description: 'Their name.' } },
  required: ['name'],
  additionalProperties: false,
});

suite('[F32-FR-06] extractJson — tolerant extraction', () => {
  test('accepts a bare JSON object', () => {
    assert.deepStrictEqual(extractJson('{"a":1}').value, { a: 1 });
  });

  test('unwraps a fenced block, with or without a language tag', () => {
    assert.deepStrictEqual(extractJson('```json\n{"a":1}\n```').value, { a: 1 });
    assert.deepStrictEqual(extractJson('```\n{"a":1}\n```').value, { a: 1 });
  });

  test('discards prose before and after', () => {
    const response = 'Here you go:\n\n```json\n{"a":1}\n```\n\nHope that helps!';
    assert.deepStrictEqual(extractJson(response).value, { a: 1 });
  });

  test('discards prose with no fence at all', () => {
    assert.deepStrictEqual(extractJson('Sure! {"a":1} — done.').value, { a: 1 });
  });

  test('takes the first balanced value when several are present', () => {
    assert.deepStrictEqual(extractJson('{"a":1} and {"b":2}').value, { a: 1 });
  });

  test('extracts an array', () => {
    assert.deepStrictEqual(extractJson('[1,2,3]').value, [1, 2, 3]);
  });

  test('is not fooled by braces inside strings', () => {
    const response = '{"description":"a } brace and a \\" quote","a":1}';
    assert.deepStrictEqual(extractJson(response).value, { description: 'a } brace and a " quote', a: 1 });
  });

  test('reports a response with no JSON at all', () => {
    const result = extractJson('I cannot help with that.');
    assert.strictEqual(result.ok, false);
    assert.match(result.reason, /no JSON/);
  });

  test('reports invalid JSON rather than throwing', () => {
    const result = extractJson('{"a": }');
    assert.strictEqual(result.ok, false);
    assert.match(result.reason, /not valid JSON/);
  });

  test('reports an unterminated value', () => {
    assert.strictEqual(extractJson('{"a": 1').ok, false);
  });

  test('reports mismatched brackets', () => {
    assert.strictEqual(extractJson('{"a": 1]').ok, false);
  });

  test('recovers from a stray closing brace before the value', () => {
    // Scanning starts at the first *opener*, so leading junk is skipped rather
    // than failing the extraction.
    assert.deepStrictEqual(extractJson('} {"a":1}').value, { a: 1 });
  });

  test('unwrapFence leaves unfenced text alone', () => {
    assert.strictEqual(unwrapFence('plain text'), 'plain text');
  });

  test('unwrapFence tolerates an unterminated fence', () => {
    assert.strictEqual(unwrapFence('```json\n{"a":1}').trim(), '{"a":1}');
  });

  test('never throws on arbitrary text', () => {
    fc.assert(fc.property(fc.string(), text => { extractJson(text); return true; }), { numRuns: 300 });
  });
});

suite('[F32-FR-08] extractProse — explanation output', () => {
  test('strips fenced blocks and collapses blank runs', () => {
    assert.strictEqual(extractProse('One.\n\n```js\ncode()\n```\n\n\n\nTwo.'), 'One.\n\nTwo.');
  });

  test('returns an empty string for a fence-only response', () => {
    assert.strictEqual(extractProse('```\ncode\n```'), '');
  });
});

suite('[F32-FR-03][S20-SR-03][S20-SR-05] verifySchemaResponse — the verification stack', () => {
  test('accepts a schema that passes every stage', () => {
    const result = verifySchemaResponse(GOOD_SCHEMA) as Verified;
    assert.ok(result.ok, `expected success, got ${JSON.stringify(stages(result))}`);
  });

  test('stage 1 catches output that is not JSON', () => {
    assert.deepStrictEqual(stages(verifySchemaResponse('sorry, no')), ['parse']);
  });

  test('stage 2 catches JSON that is not a valid schema, and stops there', () => {
    const result = verifySchemaResponse('{"type": "not-a-type"}') as Verified;
    assert.deepStrictEqual(stages(result), ['compile']);
    assert.ok(!result.ok && result.text, 'the candidate is carried through for reporting');
  });

  test('stage 3 catches a schema that compiles but lints badly', () => {
    // A duplicate enum is a warning-level lint finding.
    const response = JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'T', description: 'd',
      type: 'object',
      properties: { a: { description: 'a', enum: ['x', 'x'] } },
      additionalProperties: false,
    });
    assert.ok(stages(verifySchemaResponse(response)).includes('lint'));
  });

  test('stage 3 ignores hint-level findings, which must not block a draft', () => {
    // No $id and no per-property description are hints, not warnings.
    const response = JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'T', type: 'object', properties: { a: { type: 'string' } },
    });
    assert.ok(!stages(verifySchemaResponse(response)).includes('lint'));
  });

  test('stage 4 catches an unsatisfiable schema — the failure nothing else sees', () => {
    const response = JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'T', description: 'd', type: 'string', not: { type: 'string' },
    });
    assert.ok(stages(verifySchemaResponse(response)).includes('sample'));
  });

  test('the sample stage can be skipped for a fragment', () => {
    const response = JSON.stringify({ type: 'string', not: { type: 'string' } });
    assert.ok(!stages(verifySchemaResponse(response, { skipSample: true })).includes('sample'));
  });

  test('stage 5 runs the caller-supplied scope check', () => {
    const result = verifySchemaResponse(GOOD_SCHEMA, { scopeCheck: () => 'went too far' }) as Verified;
    assert.deepStrictEqual(stages(result), ['scope']);
    assert.match((result as { problems: Problem[] }).problems[0].message, /went too far/);
  });

  test('reports several stages at once', () => {
    const response = JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'T', description: 'd', type: 'string', not: { type: 'string' },
      examples: [1],
    });
    const found = stages(verifySchemaResponse(response));
    assert.ok(found.length >= 2, `expected several problems, got ${found.join(',')}`);
  });

  test('never throws on arbitrary responses', () => {
    fc.assert(
      fc.property(fc.string(), response => { verifySchemaResponse(response); return true; }),
      { numRuns: 200 },
    );
  });
});

suite('[F32-FR-04][F32-FR-05] runVerifiedGeneration — the retry loop', () => {
  const okVerify = (response: string) => ({ ok: true as const, value: response });

  test('returns on the first successful attempt', async () => {
    let calls = 0;
    const outcome = await runVerifiedGeneration({
      generate: async () => { calls++; return 'good'; },
      verify: okVerify,
    });
    assert.deepStrictEqual(outcome, { ok: true, value: 'good', attempts: 1 });
    assert.strictEqual(calls, 1);
  });

  test('retries, feeding the previous attempt problems back in', async () => {
    const seen: Problem[][] = [];
    const outcome = await runVerifiedGeneration({
      generate: async (problems: Problem[]) => { seen.push(problems); return `attempt${seen.length}`; },
      verify: (response: string) => (response === 'attempt3'
        ? { ok: true as const, value: response }
        : { ok: false as const, problems: [{ stage: 'compile', message: `bad ${response}` }] }),
    });
    assert.ok(outcome.ok);
    assert.strictEqual(outcome.attempts, 3);
    assert.deepStrictEqual(seen[0], [], 'the first attempt gets no feedback');
    assert.match(seen[1][0].message, /bad attempt1/);
    assert.match(seen[2][0].message, /bad attempt2/);
  });

  test('gives up after maxAttempts, returning the last candidate and its problems', async () => {
    const outcome = await runVerifiedGeneration({
      maxAttempts: 2,
      generate: async () => 'candidate',
      verify: () => ({ ok: false as const, problems: [{ stage: 'lint', message: 'nope' }], value: 'candidate' }),
    });
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.attempts, 2);
    assert.strictEqual(outcome.value, 'candidate');
    assert.deepStrictEqual(outcome.problems.map((p: Problem) => p.stage), ['lint']);
  });

  test('defaults to three attempts', async () => {
    let calls = 0;
    const outcome = await runVerifiedGeneration({
      generate: async () => { calls++; return 'x'; },
      verify: () => ({ ok: false as const, problems: [] }),
    });
    assert.strictEqual(calls, DEFAULT_MAX_ATTEMPTS);
    assert.strictEqual(outcome.attempts, DEFAULT_MAX_ATTEMPTS);
  });

  test('clamps a nonsensical attempt count to at least one', async () => {
    let calls = 0;
    await runVerifiedGeneration({
      maxAttempts: 0,
      generate: async () => { calls++; return 'x'; },
      verify: () => ({ ok: false as const, problems: [] }),
    });
    assert.strictEqual(calls, 1);
  });

  test('a failing model request becomes a problem and is retried', async () => {
    let calls = 0;
    const outcome = await runVerifiedGeneration({
      maxAttempts: 2,
      generate: async () => {
        calls++;
        if (calls === 1) { throw new Error('network down'); }
        return 'good';
      },
      verify: okVerify,
    });
    assert.ok(outcome.ok);
    assert.strictEqual(calls, 2);
  });

  test('reports the request failure when every attempt fails', async () => {
    const outcome = await runVerifiedGeneration({
      maxAttempts: 2,
      generate: async () => { throw new Error('offline'); },
      verify: okVerify,
    });
    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.problems[0].message, /offline/);
  });
});

suite('[F32-FR-04] describeProblems — reporting', () => {
  test('lists each problem with its stage', () => {
    const text = describeProblems([
      { stage: 'compile', message: 'bad type' },
      { stage: 'sample', message: 'unsatisfiable' },
    ]);
    assert.strictEqual(text, '- [compile] bad type\n- [sample] unsatisfiable');
  });

  test('says so when there is nothing to report', () => {
    assert.match(describeProblems([]), /No problems/);
  });
});

suite('[F32-FR-07][S20-SR-04] onlyDescriptionsChanged — scope check', () => {
  const base = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } } };

  test('accepts added descriptions', () => {
    const after = {
      type: 'object',
      properties: { a: { type: 'string', description: 'A' }, b: { type: 'number', description: 'B' } },
    };
    assert.strictEqual(onlyDescriptionsChanged(base, after), undefined);
  });

  test('accepts an edited description', () => {
    const before = { properties: { a: { type: 'string', description: 'old' } } };
    const after = { properties: { a: { type: 'string', description: 'new' } } };
    assert.strictEqual(onlyDescriptionsChanged(before, after), undefined);
  });

  test('accepts reordered keys, which are not a semantic change', () => {
    const after = { properties: { b: { type: 'number' }, a: { type: 'string' } }, type: 'object' };
    assert.strictEqual(onlyDescriptionsChanged(base, after), undefined);
  });

  test('rejects a retyped property', () => {
    const after = { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } };
    assert.match(onlyDescriptionsChanged(base, after) ?? '', /more than descriptions/);
  });

  test('rejects an added or removed property', () => {
    assert.ok(onlyDescriptionsChanged(base, { type: 'object', properties: { a: { type: 'string' } } }));
    assert.ok(onlyDescriptionsChanged(base, {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' }, c: {} },
    }));
  });

  test('rejects a changed required list', () => {
    assert.ok(onlyDescriptionsChanged({ ...base, required: ['a'] }, { ...base, required: ['a', 'b'] }));
  });
});

suite('[F32-FR-10] noPropertyLoss — enrichment scope check', () => {
  const base = {
    type: 'object',
    properties: {
      email: { type: 'string' },
      address: { type: 'object', properties: { city: { type: 'string' } } },
    },
  };

  test('accepts additive refinement', () => {
    const after = {
      type: 'object',
      title: 'Person',
      properties: {
        email: { type: 'string', format: 'email', description: 'Contact address.' },
        address: { type: 'object', properties: { city: { type: 'string' } } },
      },
    };
    assert.strictEqual(noPropertyLoss(base, after), undefined);
  });

  test('rejects a dropped property, naming its path', () => {
    const after = { type: 'object', properties: { email: { type: 'string' } } };
    assert.match(noPropertyLoss(base, after) ?? '', /dropped the property "address"/);
  });

  test('rejects a dropped nested property', () => {
    const after = { type: 'object', properties: { email: { type: 'string' }, address: { type: 'object' } } };
    assert.match(noPropertyLoss(base, after) ?? '', /address\.city/);
  });

  test('rejects a retyped property, naming both types', () => {
    const after = {
      type: 'object',
      properties: { email: { type: 'number' }, address: { type: 'object', properties: { city: { type: 'string' } } } },
    };
    assert.match(noPropertyLoss(base, after) ?? '', /retyped "email" from string to number/);
  });

  test('accepts a type added to a previously untyped property', () => {
    const before = { properties: { a: {} } };
    const after = { properties: { a: { type: 'string' } } };
    assert.strictEqual(noPropertyLoss(before, after), undefined);
  });

  test('tracks properties through items, composition branches and $defs', () => {
    const before = {
      properties: { list: { type: 'array', items: { properties: { x: { type: 'string' } } } } },
      allOf: [{ properties: { y: { type: 'number' } } }],
      $defs: { A: { properties: { z: { type: 'boolean' } } } },
    };
    assert.match(noPropertyLoss(before, { properties: {} }) ?? '', /dropped/);
    assert.strictEqual(noPropertyLoss(before, before), undefined);
  });

  test('survives a self-referential schema object', () => {
    const cyclic: Record<string, unknown> = { properties: { a: { type: 'string' } } };
    (cyclic.properties as Record<string, unknown>).self = cyclic;
    assert.strictEqual(noPropertyLoss(cyclic, cyclic), undefined);
  });

  test('never throws on arbitrary pairs', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (a, b) => {
        noPropertyLoss(a, b);
        onlyDescriptionsChanged(a, b);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
