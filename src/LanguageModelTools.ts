// F33-FR-07/08/09 — the editor half of the agent tool surface. Registers every
// descriptor from `agentTools` as a VS Code language model tool, so an agent in
// the editor gets the project's deterministic answers instead of guessing.
//
// The handlers delegate to the CLI core through the same `invokeAgentTool` the
// MCP server uses (F33-FR-02), with a workspace-scoped `CliIO` that refuses to
// read outside the workspace and never touches the network (F33-FR-08/09).

import * as vscode from 'vscode';
import * as path from 'path';
import { readFileSync, readdirSync } from 'fs';
import { AGENT_TOOLS, invokeAgentTool } from './agentTools';
import { isInsideRoot } from './pathSafety';
import { runCli, type CliIO } from './cli/cli';

/** Root all tool file arguments resolve against. */
function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * A `CliIO` scoped to the workspace: reads are confined to it, and fetching is
 * refused outright so a tool cannot make a network request of its own
 * (F33-FR-09). A remote `$ref` therefore reports as unresolved, which is the
 * honest answer rather than a silent fetch.
 */
export function createWorkspaceIo(root: string, version: string): CliIO {
  return {
    readFile: (absPath: string) => {
      if (!isInsideRoot(root, absPath)) {
        throw new Error(`Refusing to read outside the workspace: ${path.basename(absPath)}`);
      }
      return readFileSync(absPath, 'utf-8');
    },
    fetchText: async () => {
      throw new Error('Agent tools do not fetch over the network; cache the schema locally first.');
    },
    walk: (dir: string) => {
      if (!isInsideRoot(root, dir) && dir !== root) { return []; }
      const skip = new Set(['node_modules', '.git', 'dist', 'out', 'coverage']);
      const files: string[] = [];
      const visit = (d: string): void => {
        let entries;
        try {
          entries = readdirSync(d, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!skip.has(entry.name)) { visit(path.join(d, entry.name)); }
          } else if (entry.isFile()) {
            files.push(path.join(d, entry.name));
          }
        }
      };
      visit(dir);
      return files;
    },
    cwd: root,
    version,
  };
}

export function registerLanguageModelTools(context: vscode.ExtensionContext): void {
  const lm = (vscode as unknown as { lm?: typeof vscode.lm }).lm;
  // Older hosts have no tool API; the CLI's `jstk mcp` still serves the same
  // tools, so this is a soft capability rather than a requirement.
  if (!lm?.registerTool) { return; }

  const version = context.extension?.packageJSON?.version ?? '0.0.0';

  for (const descriptor of AGENT_TOOLS) {
    context.subscriptions.push(
      lm.registerTool(descriptor.name, {
        invoke: async (options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>) => {
          const root = workspaceRoot();
          if (!root) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart('No workspace folder is open, so there are no files to read.'),
            ]);
          }
          const io = createWorkspaceIo(root, version);
          const result = await invokeAgentTool(
            descriptor.name,
            options.input ?? {},
            argv => runCli(argv, io),
          );
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(result.text),
          ]);
        },
      }),
    );
  }
}
