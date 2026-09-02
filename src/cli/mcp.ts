// F33 — Model Context Protocol server over stdio. Pure protocol handling
// (F33-FR-13): a request goes in, a response comes out, and the stdin/stdout
// loop lives in `bin.ts` so the whole surface is unit-testable without spawning
// a process.
//
// The protocol subset MCP needs for a tools-only server is small enough to
// implement directly, which keeps the CLI dependency-free (F33-NFR-02) and its
// supply-chain surface unchanged.

import { AGENT_TOOLS, invokeAgentTool } from '../agentTools';
import { runCli, type CliIO } from './cli';

/** MCP revision this server implements. */
export const PROTOCOL_VERSION = '2024-11-05';

export const SERVER_INFO = { name: 'json-schema-toolkit', version: '' } as const;

/** JSON-RPC 2.0 error codes used here (F33-FR-12). */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  internalError: -32603,
} as const;

interface RpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

/** Runs one tool by name; injected so the protocol layer is testable alone. */
export type ToolInvoker = (
  name: string,
  input: Record<string, unknown>,
) => Promise<{ text: string; isError: boolean }>;

function rpcError(id: unknown, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

function rpcResult(id: unknown, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Handle one newline-delimited JSON-RPC message (F33-FR-11/12).
 *
 * Returns the response line, or `undefined` for a notification — a message
 * with no `id` carries no response by definition, and answering one would
 * corrupt the stream.
 */
export async function handleMcpMessage(
  line: string,
  invoke: ToolInvoker,
  version = '0.0.0',
): Promise<string | undefined> {
  let message: RpcRequest;
  try {
    message = JSON.parse(line) as RpcRequest;
  } catch {
    return rpcError(null, RPC.parseError, 'Parse error: message is not valid JSON.');
  }
  if (!isRecord(message)) {
    return rpcError(null, RPC.invalidRequest, 'Invalid request: expected a JSON object.');
  }

  const { id, method } = message;
  const isNotification = id === undefined || id === null;

  if (typeof method !== 'string') {
    return isNotification
      ? undefined
      : rpcError(id, RPC.invalidRequest, 'Invalid request: "method" must be a string.');
  }
  // Notifications (`notifications/initialized`, cancellations, …) are accepted
  // and acknowledged by silence.
  if (isNotification) { return undefined; }

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { ...SERVER_INFO, version },
      });

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, {
        tools: AGENT_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });

    case 'tools/call': {
      const params = isRecord(message.params) ? message.params : {};
      const name = params.name;
      if (typeof name !== 'string') {
        return rpcError(id, RPC.invalidRequest, 'tools/call requires a string "name".');
      }
      const args = isRecord(params.arguments) ? params.arguments : {};
      try {
        const result = await invoke(name, args);
        // A tool failure is a *result* with isError, not a protocol error, so
        // the agent can read what went wrong (F33-FR-12).
        return rpcResult(id, {
          content: [{ type: 'text', text: result.text }],
          isError: result.isError,
        });
      } catch (e) {
        return rpcResult(id, {
          content: [{ type: 'text', text: `Tool "${name}" failed: ${(e as Error).message}` }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, RPC.methodNotFound, `Method not found: ${method}`);
  }
}

/** Bind the tool set to the CLI core, so every tool answers exactly as `jstk` does. */
export function createInvoker(io: CliIO): ToolInvoker {
  return (name, input) => invokeAgentTool(name, input, argv => runCli(argv, io));
}

/**
 * Split a growing stdin buffer into complete lines, returning the lines and the
 * unterminated remainder. Kept here (rather than in the binary) so the framing
 * is covered by tests along with the rest of the protocol.
 */
export function takeLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.map(l => l.trim()).filter(l => l !== ''), rest };
}
