import * as assert from 'assert';
import fc from 'fast-check';

const {
  AGENT_TOOLS,
  findTool,
  isFailureCode,
  invokeAgentTool,
  ToolInputError,
} = require('../../agentTools');

interface Descriptor {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
  toArgv(input: Record<string, unknown>): string[];
}

const tools = AGENT_TOOLS as Descriptor[];
const tool = (name: string): Descriptor => {
  const found = findTool(name);
  assert.ok(found, `no tool named ${name}`);
  return found as Descriptor;
};

/** A runner that records the argv it was given and returns a canned result. */
const recorder = (result: Partial<{ stdout: string; stderr: string; code: number }> = {}) => {
  const calls: string[][] = [];
  const run = async (argv: string[]) => {
    calls.push(argv);
    return { stdout: 'out', stderr: '', code: 0, ...result };
  };
  return { calls, run };
};

suite('[F33-FR-01] AGENT_TOOLS — one descriptor table', () => {
  test('every descriptor is complete and well-formed', () => {
    for (const descriptor of tools) {
      assert.match(descriptor.name, /^jsonschema_[a-z]+$/, `${descriptor.name} is not a stable tool id`);
      assert.ok(descriptor.description.length > 40, `${descriptor.name} needs a description a model can choose on`);
      assert.strictEqual(descriptor.inputSchema.type, 'object');
      assert.ok(descriptor.inputSchema.properties, `${descriptor.name} declares no input properties`);
      assert.strictEqual(typeof descriptor.toArgv, 'function');
    }
  });

  test('tool names are unique', () => {
    assert.strictEqual(new Set(tools.map(t => t.name)).size, tools.length);
  });

  test('every declared required key exists in properties', () => {
    for (const descriptor of tools) {
      for (const key of descriptor.inputSchema.required ?? []) {
        assert.ok(key in descriptor.inputSchema.properties, `${descriptor.name}: required "${key}" is not declared`);
      }
    }
  });
});

suite('[F33-FR-03] AGENT_TOOLS — the initial tool set', () => {
  test('covers validate, lint, diff, bundle, infer, sample, coverage and test', () => {
    assert.deepStrictEqual(tools.map(t => t.name).sort(), [
      'jsonschema_bundle',
      'jsonschema_coverage',
      'jsonschema_diff',
      'jsonschema_infer',
      'jsonschema_lint',
      'jsonschema_sample',
      'jsonschema_test',
      'jsonschema_validate',
    ]);
  });

  test('findTool returns undefined for an unknown name', () => {
    assert.strictEqual(findTool('nope'), undefined);
  });
});

suite('[F33-FR-02] toArgv — delegation to the CLI core', () => {
  test('validate maps onto the validate subcommand', () => {
    assert.deepStrictEqual(
      tool('jsonschema_validate').toArgv({ dataFile: 'a.json', schemaFile: 's.json' }),
      ['validate', 'a.json', '--schema', 's.json', '--json'],
    );
  });

  test('lint maps onto the lint subcommand', () => {
    assert.deepStrictEqual(tool('jsonschema_lint').toArgv({ schemaFile: 's.json' }), ['lint', 's.json', '--json']);
  });

  test('diff asks for the compatibility verdict, and honours strict', () => {
    assert.deepStrictEqual(
      tool('jsonschema_diff').toArgv({ oldSchemaFile: 'a.json', newSchemaFile: 'b.json' }),
      ['diff', 'a.json', 'b.json', '--check', '--json'],
    );
    assert.deepStrictEqual(
      tool('jsonschema_diff').toArgv({ oldSchemaFile: 'a.json', newSchemaFile: 'b.json', strict: true }),
      ['diff', 'a.json', 'b.json', '--check', '--strict', '--json'],
    );
  });

  test('bundle honours the dereference flag', () => {
    assert.deepStrictEqual(tool('jsonschema_bundle').toArgv({ schemaFile: 's.json' }), ['bundle', 's.json']);
    assert.deepStrictEqual(
      tool('jsonschema_bundle').toArgv({ schemaFile: 's.json', dereference: true }),
      ['bundle', 's.json', '--dereference'],
    );
  });

  test('infer passes an optional draft through', () => {
    assert.deepStrictEqual(tool('jsonschema_infer').toArgv({ dataFile: 'd.json' }), ['infer', 'd.json']);
    assert.deepStrictEqual(
      tool('jsonschema_infer').toArgv({ dataFile: 'd.json', draft: 'draft-07' }),
      ['infer', 'd.json', '--to', 'draft-07'],
    );
  });

  test('sample maps onto the sample subcommand', () => {
    assert.deepStrictEqual(tool('jsonschema_sample').toArgv({ schemaFile: 's.json' }), ['sample', 's.json']);
  });

  test('coverage accepts several data files, and a bare string', () => {
    assert.deepStrictEqual(
      tool('jsonschema_coverage').toArgv({ dataFiles: ['a.json', 'b.json'], schemaFile: 's.json' }),
      ['coverage', 'a.json', 'b.json', '--schema', 's.json', '--json'],
    );
    assert.deepStrictEqual(
      tool('jsonschema_coverage').toArgv({ dataFiles: 'a.json', schemaFile: 's.json' }),
      ['coverage', 'a.json', '--schema', 's.json', '--json'],
    );
  });

  test('test accepts several suite files', () => {
    assert.deepStrictEqual(
      tool('jsonschema_test').toArgv({ suiteFiles: ['a.schema.test.json'] }),
      ['test', 'a.schema.test.json', '--json'],
    );
  });

  test('missing required input throws a ToolInputError naming the field', () => {
    assert.throws(() => tool('jsonschema_validate').toArgv({ dataFile: 'a.json' }), (e: Error) => {
      assert.ok(e instanceof ToolInputError);
      assert.match(e.message, /schemaFile/);
      return true;
    });
    assert.throws(() => tool('jsonschema_coverage').toArgv({ dataFiles: [], schemaFile: 's' }), /dataFiles/);
    assert.throws(() => tool('jsonschema_test').toArgv({ suiteFiles: [] }), /suiteFiles/);
  });

  test('blank and non-string values count as missing', () => {
    assert.throws(() => tool('jsonschema_lint').toArgv({ schemaFile: '   ' }), /schemaFile/);
    assert.throws(() => tool('jsonschema_lint').toArgv({ schemaFile: 42 }), /schemaFile/);
  });

  test('a list drops non-string and blank entries', () => {
    assert.deepStrictEqual(
      tool('jsonschema_test').toArgv({ suiteFiles: ['a.json', '', 7, null, 'b.json'] }),
      ['test', 'a.json', 'b.json', '--json'],
    );
  });
});

suite('[F33-FR-12] isFailureCode — a finding is an answer, not an error', () => {
  test('0 and 1 are answers; everything else is a failure', () => {
    assert.strictEqual(isFailureCode(0), false);
    assert.strictEqual(isFailureCode(1), false, 'exit 1 means "found something", which is the answer');
    for (const code of [2, 64, 65, 70]) {
      assert.strictEqual(isFailureCode(code), true, `exit ${code} is a failure`);
    }
  });
});

suite('[F33-FR-04][F33-FR-05][F33-FR-06][F33-NFR-01][F33-NFR-03] invokeAgentTool — totality', () => {
  test('runs the tool and returns its output', async () => {
    const { calls, run } = recorder({ stdout: 'the answer' });
    const result = await invokeAgentTool('jsonschema_lint', { schemaFile: 's.json' }, run);
    assert.deepStrictEqual(calls, [['lint', 's.json', '--json']]);
    assert.deepStrictEqual(result, { text: 'the answer', isError: false });
  });

  test('a finding (exit 1) is returned as a result, not an error', async () => {
    const { run } = recorder({ stdout: 'not backward-compatible', code: 1 });
    const result = await invokeAgentTool(
      'jsonschema_diff', { oldSchemaFile: 'a', newSchemaFile: 'b' }, run,
    );
    assert.strictEqual(result.isError, false);
    assert.match(result.text, /not backward-compatible/);
  });

  test('a usage or data failure is flagged as an error', async () => {
    const { run } = recorder({ stdout: '', stderr: 'Cannot read file', code: 65 });
    const result = await invokeAgentTool('jsonschema_lint', { schemaFile: 's.json' }, run);
    assert.strictEqual(result.isError, true);
    assert.match(result.text, /Cannot read file/);
  });

  test('an unknown tool is reported, not thrown', async () => {
    const { run } = recorder();
    const result = await invokeAgentTool('nope', {}, run);
    assert.strictEqual(result.isError, true);
    assert.match(result.text, /Unknown tool/);
  });

  test('bad input is reported, not thrown', async () => {
    const { calls, run } = recorder();
    const result = await invokeAgentTool('jsonschema_validate', {}, run);
    assert.strictEqual(result.isError, true);
    assert.match(result.text, /dataFile/);
    assert.strictEqual(calls.length, 0, 'the CLI is never invoked with bad input');
  });

  test('a runner that throws is reported, not propagated', async () => {
    const result = await invokeAgentTool('jsonschema_lint', { schemaFile: 's' }, async () => {
      throw new Error('boom');
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.text, /boom/);
  });

  test('missing input is treated as an empty object', async () => {
    const result = await invokeAgentTool('jsonschema_lint', undefined as never, recorder().run);
    assert.strictEqual(result.isError, true);
  });

  test('empty output is reported as such rather than as an empty string', async () => {
    const { run } = recorder({ stdout: '', stderr: '' });
    const result = await invokeAgentTool('jsonschema_lint', { schemaFile: 's' }, run);
    assert.strictEqual(result.text, '(no output)');
  });

  test('never throws for arbitrary tool names and inputs', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), async (name, input) => {
        await invokeAgentTool(name, input as Record<string, unknown>, recorder().run);
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
