# F33 — Agent Tools (Language Model Tools & MCP Server)

## Overview

F32 points a model *at* this project's engines to draft things. This spec points
the relationship the other way: it exposes the project's **deterministic**
capabilities — validate, lint, diff with a compatibility verdict, bundle, infer,
sample, coverage, test — as tools an AI agent can call, so an agent working in a
repository gets ground truth instead of guessing.

That matters because the questions agents get wrong about schemas are exactly
the ones this project already answers correctly. "Is this schema change
breaking?" has a rule-based answer (F26) that a model asked to eyeball a diff
will get wrong on `required` and numeric bounds. "Does this document satisfy
that schema?" has an Ajv answer. Handing over the answer rather than the
opinion is the whole value.

Two surfaces, one definition. Inside VS Code, the capabilities are registered as
**language model tools**, so any agent in the editor can invoke them. Outside,
the CLI (F27) gains an **MCP server** over stdio, so any MCP-speaking agent —
Claude Code, an IDE, a CI bot — gets the same set. Both are generated from a
single descriptor table, so the two surfaces cannot drift apart, and both
delegate to the same modules the extension's own commands use, so no logic is
re-implemented.

MCP is chosen for the same reason SHA-pinned actions and Conventional Commits
were: it is an open standard, so the tool surface is not tied to the agent that
consumes it.

## User Stories

- As someone using an AI agent in my editor, I want it to *check* whether my
  schema change is breaking rather than assert it, so I can trust the answer.
- As an agent author, I want a schema toolchain over MCP so my agent can
  validate and lint without shelling out and parsing human-readable output.
- As a maintainer, I want one definition of the tool surface, so adding a
  capability lights up both agent surfaces at once.

## Functional Requirements

### Shared descriptor table

- **F33-FR-01** The tool surface MUST be defined once, as a pure table of
  descriptors carrying each tool's name, human description, JSON Schema for its
  input, and its handler. Both surfaces MUST be generated from it.
- **F33-FR-02** Every handler MUST delegate to the same module the corresponding
  command and CLI subcommand use. A handler MUST NOT contain schema logic of its
  own, so an agent and a user cannot get different answers.
- **F33-FR-03** The initial set MUST cover `validate`, `lint`, `diff` (including
  the compatibility verdict), `bundle`, `infer`, `sample`, `coverage` and `test`.
- **F33-FR-04** Every handler MUST be total: invalid input, unparsable
  documents, and internal failures MUST return a structured error result naming
  the problem, never throw and never crash the host.
- **F33-FR-05** Results MUST be text a model can read directly — the same
  human-readable reports the CLI emits — with the machine-readable payload
  available where the tool's answer is structured (a verdict, a pass/fail
  count), so an agent need not parse prose to branch on an outcome.
- **F33-FR-06** File access MUST go through an injected reader, so the tool core
  performs no I/O itself and is unit-testable on in-memory documents.

### Language model tools (VS Code)

- **F33-FR-07** The extension MUST contribute the descriptor table as
  `languageModelTools` in its manifest and register a handler for each, so
  editor agents can discover and invoke them.
- **F33-FR-08** A tool invocation MUST resolve file arguments against the
  workspace and MUST refuse to read outside it. In an untrusted workspace
  (S02), tools MUST behave as the equivalent command does, including serving
  remote schemas from the local cache only.
- **F33-FR-09** Tools MUST NOT make network requests of their own; a remote
  `$ref` MUST resolve through the existing cache/credential path (F07/F08) or be
  reported as unresolved.

### MCP server (CLI)

- **F33-FR-10** The CLI MUST expose `jstk mcp`, speaking the Model Context
  Protocol over stdio as newline-delimited JSON-RPC 2.0.
- **F33-FR-11** The server MUST implement `initialize` (advertising the protocol
  version and a `tools` capability), `tools/list` (the descriptor table), and
  `tools/call` (dispatch to a handler), and MUST accept the `notifications/*`
  messages a client sends without responding to them, since notifications carry
  no `id`.
- **F33-FR-12** A call to an unknown method MUST return JSON-RPC error
  `-32601`; a malformed request MUST return `-32700`/`-32600` as appropriate. A
  handler failure MUST be returned as a tool result with `isError: true`, not as
  a protocol error, so the agent can read what went wrong.
- **F33-FR-13** The message handler MUST be pure — request in, response out —
  with the stdio loop confined to the CLI's existing thin binary layer, so the
  entire protocol surface is unit-testable without spawning a process.
- **F33-FR-14** The server MUST write nothing but JSON-RPC to stdout (diagnostics
  go to stderr), since stray output corrupts the protocol stream.

### Distribution

- **F33-FR-15** The extension MUST contribute an **MCP server definition
  provider** so that, in a host supporting it, installing the extension from
  the Marketplace is enough for the editor's agent mode to discover and start
  the `jstk mcp` server with no manual configuration. The definition MUST
  launch the published CLI package (`npx json-schema-toolkit mcp`) rather than
  bundle the CLI into the extension, so the .vsix stays within its size budget
  (S03) and the two ship independently. Registration MUST be feature-detected:
  on a host without the API the extension MUST behave exactly as before.
- **F33-FR-16** The CLI package MUST carry the metadata the open MCP Registry
  expects — a `server.json` describing the stdio server and the `mcpName`
  field linking the npm package to it — so the same server can be published to
  the registry and discovered by clients outside VS Code. Publishing itself is a
  release step, documented on the docs site.

## Non-Functional Requirements

- **F33-NFR-01** The descriptor table, every handler, and the MCP message
  handler MUST be pure, `vscode`-free modules with ≥ 80 % coverage (Article V).
  Only the VS Code registration and the stdio loop are excluded.
- **F33-NFR-02** The MCP server MUST add no runtime dependency: the protocol
  subset above is small enough to implement directly, which also keeps the CLI's
  install weight and supply-chain surface unchanged.
- **F33-NFR-03** Tools MUST be read-only with respect to the user's files. No
  tool may write, move, or delete anything; an agent that wants to apply a
  result does so through its own editing surface, which the user reviews.

## Out of Scope

- MCP resources, prompts, sampling, and roots — tools only, for now.
- A network transport (HTTP/SSE) for the MCP server. Stdio is what agents launch
  locally, and it needs no authentication story.
- Write-capable tools (apply a refactoring, fix a document). Read-only keeps the
  consent model simple; F30's refactorings remain user-driven.
- Bundling an agent, a model, or a vendor's client with the extension (S20-SR-06).

## Acceptance Criteria

1. `tools/list` returns the same tool names the extension contributes, proven by
   a test asserting the manifest and the table agree.
2. `tools/call` for `diff` on a schema pair that adds a `required` name returns
   a NOT backward-compatible verdict, matching `jstk diff --check`'s exit code.
3. An unknown method returns JSON-RPC `-32601`; a handler that throws returns a
   result with `isError: true`.
4. A notification (no `id`) produces no response.
5. Every tool handler returns a structured error rather than throwing when given
   a document that does not parse.

## Relation to Existing Specs

- **F27 (CLI)** hosts the MCP server and shares every engine the tools call.
- **F03/F15/F17/F26/F14/F06/F16/F23/F29** are the engines exposed; this spec
  adds no schema logic of its own (F33-FR-02).
- **F32 (AI authoring)** is the mirror: a model drafting *for* the user, versus
  agents calling *into* the deterministic engines here.
- **S20 (AI assistance safety)** — tools are read-only (F33-NFR-03) and
  invoked through the host's own consent flow, satisfying S20-SR-02.
- **S15 (cross-platform tooling)** — the server is Node-only, no shell.

## History

- **2026-09-02** — Initial specification.

- **2026-09-02** — Added F33-FR-15/16: the Marketplace route (an MCP server
  definition provider launching the published CLI, feature-detected) and the
  open MCP Registry route (`server.json` + `mcpName`). Bundling the CLI into
  the .vsix was rejected: the CLI bundle is ~1.4 MB against a 1.5 MB .vsix
  budget, and the two artifacts release on different cadences.
