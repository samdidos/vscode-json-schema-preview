// F33-FR-15 — the Marketplace route for the MCP server. In a host that supports
// MCP server definition providers, installing this extension is enough for the
// editor's agent mode to discover and launch `jstk mcp` with no configuration.
//
// The definition launches the *published* CLI (`npx json-schema-toolkit mcp`)
// rather than a bundled copy: the CLI bundle is ~1.4 MB against a 1.5 MB .vsix
// budget (S03), and the two artifacts release independently.
//
// The API landed after this extension's engine floor, so `@types/vscode` does
// not declare it; everything below is feature-detected and typed locally, and a
// host without the API sees no change in behaviour.

import * as vscode from 'vscode';

/** Id shared with `contributes.mcpServerDefinitionProviders` in the manifest. */
export const MCP_PROVIDER_ID = 'jsonschema.mcp';
export const MCP_SERVER_LABEL = 'JSON Schema Toolkit';
export const MCP_PACKAGE = 'json-schema-toolkit';

/** Minimal local typing of the post-1.101 API surface this file touches. */
interface McpStdioServerDefinitionCtor {
  new (
    label: string,
    command: string,
    args?: string[],
    env?: Record<string, string | number | null>,
    version?: string,
  ): object;
}
interface McpCapableLm {
  registerMcpServerDefinitionProvider?(
    id: string,
    provider: { provideMcpServerDefinitions(): object[] },
  ): vscode.Disposable;
}

/** The stdio definition: `npx json-schema-toolkit mcp`. */
export function serverDefinitionSpec(version: string): { label: string; command: string; args: string[]; version: string } {
  return { label: MCP_SERVER_LABEL, command: 'npx', args: ['-y', MCP_PACKAGE, 'mcp'], version };
}

/**
 * Register the provider when the host supports it. Returns whether it did, so
 * callers (and tests) can tell a capable host from a legacy one.
 */
export function registerMcpServerDefinition(context: vscode.ExtensionContext): boolean {
  const lm = (vscode as unknown as { lm?: McpCapableLm }).lm;
  const Definition = (vscode as unknown as { McpStdioServerDefinition?: McpStdioServerDefinitionCtor })
    .McpStdioServerDefinition;
  if (!lm?.registerMcpServerDefinitionProvider || !Definition) { return false; }

  const version = context.extension?.packageJSON?.version ?? '0.0.0';
  context.subscriptions.push(
    lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
      provideMcpServerDefinitions: () => {
        const spec = serverDefinitionSpec(version);
        return [new Definition(spec.label, spec.command, spec.args, undefined, spec.version)];
      },
    }),
  );
  return true;
}
