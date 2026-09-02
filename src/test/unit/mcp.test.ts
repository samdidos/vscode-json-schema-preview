import * as assert from 'assert';
import fc from 'fast-check';

const { handleMcpMessage, takeLines, PROTOCOL_VERSION, RPC } = require('../../cli/mcp');
const { AGENT_TOOLS } = require('../../agentTools');

type Invoker = (name: string, input: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;

const echo: Invoker = async (name, input) => ({ text: `${name}:${JSON.stringify(input)}`, isError: false });

const send = async (message: unknown, invoke: Invoker = echo): Promise<Record<string, never> | undefined> => {
  const raw = await handleMcpMessage(typeof message === 'string' ? message : JSON.stringify(message), invoke, '1.2.3');
  return raw === undefined ? undefined : JSON.parse(raw);
};

interface Response {
  jsonrpc: string;
  id: unknown;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

const ok = async (message: unknown, invoke?: Invoker): Promise<Record<string, unknown>> => {
  const response = (await send(message, invoke)) as unknown as Response;
  assert.ok(response, 'expected a response');
  assert.strictEqual(response.jsonrpc, '2.0');
  assert.ok(response.result, `expected a result, got ${JSON.stringify(response.error)}`);
  return response.result as Record<string, unknown>;
};

suite('[F33-FR-11][F33-FR-10][F33-NFR-02] handleMcpMessage — initialize', () => {
  test('advertises the protocol version, a tools capability, and the server version', async () => {
    const result = await ok({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
    assert.deepStrictEqual(result.capabilities, { tools: {} });
    assert.deepStrictEqual(result.serverInfo, { name: 'json-schema-toolkit', version: '1.2.3' });
  });

  test('echoes the request id', async () => {
    const response = (await send({ jsonrpc: '2.0', id: 'abc', method: 'initialize' })) as unknown as Response;
    assert.strictEqual(response.id, 'abc');
  });

  test('answers ping', async () => {
    assert.deepStrictEqual(await ok({ jsonrpc: '2.0', id: 2, method: 'ping' }), {});
  });
});

suite('[F33-FR-11] handleMcpMessage — tools/list', () => {
  test('lists every descriptor with its schema', async () => {
    const result = await ok({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const tools = result.tools as Array<{ name: string; description: string; inputSchema: unknown }>;
    assert.strictEqual(tools.length, AGENT_TOOLS.length);
    assert.deepStrictEqual(
      tools.map(t => t.name).sort(),
      AGENT_TOOLS.map((t: { name: string }) => t.name).sort(),
    );
    assert.ok(tools.every(t => t.description && t.inputSchema));
  });
});

suite('[F33-FR-11] handleMcpMessage — tools/call', () => {
  test('dispatches to the named tool and wraps the text result', async () => {
    const result = await ok({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'jsonschema_lint', arguments: { schemaFile: 's.json' } },
    });
    assert.deepStrictEqual(result.content, [
      { type: 'text', text: 'jsonschema_lint:{"schemaFile":"s.json"}' },
    ]);
    assert.strictEqual(result.isError, false);
  });

  test('defaults absent arguments to an empty object', async () => {
    const result = await ok({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'jsonschema_lint' } });
    assert.match((result.content as Array<{ text: string }>)[0].text, /\{\}$/);
  });

  test('rejects a call with no tool name', async () => {
    const response = (await send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: {} })) as unknown as Response;
    assert.strictEqual(response.error?.code, RPC.invalidRequest);
  });

  test('rejects a call with non-object params', async () => {
    const response = (await send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: 'nope' })) as unknown as Response;
    assert.strictEqual(response.error?.code, RPC.invalidRequest);
  });
});

suite('[F33-FR-12] handleMcpMessage — errors', () => {
  test('a tool failure is a result with isError, not a protocol error', async () => {
    const failing: Invoker = async () => ({ text: 'file not found', isError: true });
    const result = await ok(
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'jsonschema_lint' } },
      failing,
    );
    assert.strictEqual(result.isError, true);
    assert.deepStrictEqual(result.content, [{ type: 'text', text: 'file not found' }]);
  });

  test('an invoker that throws still yields a readable tool result', async () => {
    const throwing: Invoker = async () => { throw new Error('kaboom'); };
    const result = await ok(
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'jsonschema_lint' } },
      throwing,
    );
    assert.strictEqual(result.isError, true);
    assert.match((result.content as Array<{ text: string }>)[0].text, /kaboom/);
  });

  test('unparsable JSON is a parse error', async () => {
    const response = (await send('{ not json')) as unknown as Response;
    assert.strictEqual(response.error?.code, RPC.parseError);
    assert.strictEqual(response.id, null);
  });

  test('a non-object message is an invalid request', async () => {
    const response = (await send('42')) as unknown as Response;
    assert.strictEqual(response.error?.code, RPC.invalidRequest);
  });

  test('a request whose method is not a string is an invalid request', async () => {
    const response = (await send({ jsonrpc: '2.0', id: 10, method: 7 })) as unknown as Response;
    assert.strictEqual(response.error?.code, RPC.invalidRequest);
  });

  test('an unknown method is method-not-found, naming it', async () => {
    const response = (await send({ jsonrpc: '2.0', id: 11, method: 'resources/list' })) as unknown as Response;
    assert.strictEqual(response.error?.code, RPC.methodNotFound);
    assert.match(response.error?.message ?? '', /resources\/list/);
  });
});

suite('[F33-FR-11] handleMcpMessage — notifications', () => {
  test('a message with no id produces no response', async () => {
    assert.strictEqual(await send({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
  });

  test('a null id is a notification too', async () => {
    assert.strictEqual(await send({ jsonrpc: '2.0', id: null, method: 'notifications/cancelled' }), undefined);
  });

  test('a notification with a bad method is still silent', async () => {
    assert.strictEqual(await send({ jsonrpc: '2.0', method: 7 }), undefined);
  });
});

suite('[F33-FR-13] handleMcpMessage — totality', () => {
  test('never throws, and always emits valid JSON or nothing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async line => {
        const response = await handleMcpMessage(line, echo, '1.0.0');
        if (response !== undefined) { JSON.parse(response); }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  test('never throws for arbitrary JSON-RPC-shaped messages', async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async message => {
        const response = await handleMcpMessage(JSON.stringify(message), echo, '1.0.0');
        if (response !== undefined) { JSON.parse(response); }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

suite('[F33-FR-14] takeLines — stdio framing', () => {
  test('splits complete lines and keeps the remainder', () => {
    assert.deepStrictEqual(takeLines('{"a":1}\n{"b":2}\n{"c":'), {
      lines: ['{"a":1}', '{"b":2}'],
      rest: '{"c":',
    });
  });

  test('drops blank lines and trims whitespace', () => {
    assert.deepStrictEqual(takeLines('  {"a":1}  \n\n\n'), { lines: ['{"a":1}'], rest: '' });
  });

  test('returns nothing for a buffer with no newline yet', () => {
    assert.deepStrictEqual(takeLines('{"partial"'), { lines: [], rest: '{"partial"' });
  });

  test('handles an empty buffer', () => {
    assert.deepStrictEqual(takeLines(''), { lines: [], rest: '' });
  });
});
