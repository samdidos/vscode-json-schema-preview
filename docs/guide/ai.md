# AI Assistance & Agent Tools

This extension has two, separate relationships with AI, and it is worth keeping
them apart:

1. **Agent tools** — the project's *deterministic* engines exposed so an AI agent
   can call them. Read-only, always available, no setting to enable.
2. **AI-assisted authoring** — an optional, opt-in set of commands where a
   language model drafts something for you. **Off by default.**

<!-- spec:F33 start -->

## Agent tools

An agent asked to eyeball a schema diff will get `required` and numeric bounds
wrong. Asked whether a document validates, it will guess. Both questions already
have correct, rule-based answers here — so those answers are exposed as tools an
agent can call, rather than left for it to approximate.

Eight tools are available:

| Tool | Answers |
|---|---|
| `jsonschema_validate` | Does this data file satisfy this schema? (with line numbers) |
| `jsonschema_lint` | What is wrong with this schema? |
| `jsonschema_diff` | Is this schema change backward-compatible? |
| `jsonschema_bundle` | What does this multi-file schema look like flattened? |
| `jsonschema_infer` | What schema describes this data? |
| `jsonschema_sample` | What does a valid document look like? |
| `jsonschema_coverage` | Which parts of this schema does my data never use? |
| `jsonschema_test` | Does this schema still pass its pinned test cases? |

Both surfaces below are generated from a single table in the source, so they
cannot drift apart, and every handler delegates to the same module the
equivalent command and CLI subcommand use — there is no second implementation of
any schema logic.

### In VS Code

The tools are contributed as language model tools and registered on activation.
Any agent in the editor can discover and invoke them; you can also reference one
explicitly in a prompt by its short name (`#schemadiff`, `#schemavalidate`, …).

Two guarantees apply to every invocation:

- **Workspace-confined.** File arguments resolve against the workspace folder,
  and a read outside it is refused.
- **No network.** A tool never fetches. A remote `$ref` resolves through the
  local schema cache ([authentication](/guide/authentication)) or is reported as
  unresolved — which is the honest answer rather than a silent request.

Tools are read-only: none of them writes, moves or deletes anything.

### Anywhere else — the MCP server

The CLI serves the same tools over the
[Model Context Protocol](https://modelcontextprotocol.io) on stdio:

```sh
npx json-schema-toolkit mcp
```

Register it with any MCP-speaking client — Claude Code, an IDE, a CI bot:

```jsonc
// .mcp.json
{
  "mcpServers": {
    "json-schema": {
      "command": "npx",
      "args": ["json-schema-toolkit", "mcp"]
    }
  }
}
```

The server implements `initialize`, `tools/list` and `tools/call`. A tool that
fails comes back as a result marked `isError`, not as a protocol error, so the
agent can read what went wrong. A *finding* — an invalid document, a breaking
change, a failing test — is not an error at all: it is the answer.

MCP was chosen for the same reason this project pins actions by SHA and uses
Conventional Commits: it is an open standard, so the tool surface is not tied to
whichever agent consumes it.

<!-- spec:F33 end -->

<!-- spec:F32,S20 start -->

## AI-assisted authoring

Some schema chores are mechanical for a person but not expressible as an
algorithm: writing a description for `retryBackoffMs`, explaining what
`must match pattern "^[a-z][a-z0-9-]*$"` means to someone who did not write the
pattern, or turning "an order with line items and a shipping address" into a
first draft.

### Turning it on

Set `jsonschema.ai.enabled` to `true`. It is `false` by default, and while it is
off no code path can reach a model request — the commands stop at the setting and
offer to enable it.

### What you get

| Command | What it does |
|---|---|
| **Describe Properties** | Drafts a `description` for every property that lacks one, applied as one previewed, undoable edit. |
| **Explain This Finding** | Explains a validation error or lint finding against your actual value and subschema, ending with the fix. Prose only — it never edits. |
| **Draft a Schema from a Description** | A sentence in, a verified schema out, opened in a new tab. |
| **Enrich Inferred Schema** | Adds `format`, `enum` candidates, titles and `$defs` names to a structurally-inferred schema. |
| **Generate Realistic Sample Data** | Instances that read like real documents — or, in adversarial mode, ones that break the schema the way a person plausibly would. |
| **Write Migration Notes** | Turns a computed diff and its verdict into release notes, proposing a compatible alternative for each breaking change. |

### The rules it follows

**It is a drafting tool, never an authority.** Four guarantees make that
concrete:

- **No vendor, no key.** Model access goes through VS Code's own Language Model
  API, so your configured provider does the work. The extension ships no SDK, no
  model identifier, no endpoint, and never handles a credential. Swapping your
  provider changes nothing here.
- **Everything is verified.** Any schema a model produces must parse, compile
  under Ajv, lint clean of warnings, and be able to produce a valid instance
  before you are shown it. If it fails, the concrete failures are fed back and it
  tries again (up to `jsonschema.ai.maxAttempts`, default 3). If it still fails,
  you get the candidate **explicitly marked unverified** with its problems —
  never silently, and never as if it had passed.

  Those four stages each catch something the previous one cannot. The last one
  matters most: a schema that compiles and lints but that *no document can
  satisfy* fails silently at authoring time and loudly everywhere else.
- **Nothing is applied unseen.** Every change is a single undoable edit you
  review. A result whose scope exceeds what the command promised — a description
  pass that also retyped a property, an enrichment that dropped one — is
  rejected rather than applied.
- **Deterministic paths stay deterministic.** Validation, diff, bundling,
  migration, code generation and sample generation never consult a model. Their
  output does not vary with your AI settings.

### What is sent

Only the artifacts the command you ran operates on, plus the file's base name:

| Command | Sends |
|---|---|
| Describe Properties | The schema document |
| Explain This Finding | The finding's message, the offending value, the schema |
| Draft a Schema | The description you typed |
| Enrich Inferred Schema | The schema document |
| Generate Sample Data | The schema document |
| Write Migration Notes | The computed diff report and its verdict |

Absolute paths, your workspace layout, your settings, stored credentials, and the
contents of unrelated files are never sent — there is no parameter through which
they could arrive. Large documents are truncated rather than sent whole.

**Zero telemetry is unconditional and unaffected by any of this**: no usage data,
analytics or crash reports go anywhere, including to a model. Requests happen
only in direct response to a command you ran — never on activation, open, save,
type, or a timer.

<!-- spec:F32,S20 end -->

<!-- spec:F33 start -->

## Getting the MCP server to agents

There are three routes, from least to most setup, and they all launch the same
`jstk mcp` process.

### 1. Install the extension

In a VS Code that supports MCP server definition providers (1.101 and later), the
extension **registers the server itself**: agent mode lists "JSON Schema
Toolkit" under MCP servers the moment the extension is installed, with nothing
to configure. The definition launches the published CLI
(`npx -y json-schema-toolkit mcp`), so the first start needs npm access; after
that it is cached. On an older VS Code the provider is simply not registered and
nothing else changes.

This is how "publishing an MCP server to the Marketplace" works today: the
Marketplace has no server category of its own — an extension carries the
definition, and installing the extension is what publishes the server to that
user's editor.

### 2. Configure it by hand

Any MCP client — Claude Code, Cursor, an IDE plugin, a CI bot — can launch it
from its own configuration:

```jsonc
{ "mcpServers": { "json-schema": { "command": "npx", "args": ["-y", "json-schema-toolkit", "mcp"] } } }
```

### 3. The open MCP Registry

The CLI package ships a `server.json` and an `mcpName` field
(`io.github.samdidos/json-schema-toolkit`), which is what the
[MCP Registry](https://registry.modelcontextprotocol.io) reads. Publishing is a
release step, done once per CLI version:

```sh
# from cli/, after `npm publish`
npx @modelcontextprotocol/publisher login github
npx @modelcontextprotocol/publisher publish
```

The registry verifies namespace ownership through the GitHub login (the
`io.github.<user>` prefix) and that the npm package's `mcpName` matches
`server.json`. Once listed, clients that browse the registry — including the MCP
server gallery in VS Code's Extensions view, which is fed from it — can find and
install the server without knowing this project exists.

<!-- spec:F33 end -->
