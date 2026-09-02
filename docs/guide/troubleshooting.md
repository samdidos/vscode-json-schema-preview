# Troubleshooting

<!-- spec:S03 -->
Start here: the extension logs everything it does — render failures, fetch
errors, cache decisions — to a dedicated **"JSON Schema Preview"** channel in the
**Output** panel (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>, then pick it from
the dropdown).

<!-- spec:F34 start -->

## My file isn't recognised as a schema

The toolbar icons, the linter and the schema commands appear only for documents
recognised as schemas. A document is a schema when **any** of these hold:

1. Its `$schema` points at the JSON Schema meta-schema
   (`https://json-schema.org/draft/2020-12/schema` and friends).
2. Its file name looks like one: `*.schema.json`, `*.schema.yaml`, `*.schema.yml`
   or `schema.json`.
3. Its root object declares `properties` **and** either a `$defs`/`definitions`
   block or `type: "object"`.

A bare `properties` key is deliberately *not* enough — that shape is common in
ordinary configuration files.

**The one thing that always wins**: a document whose `$schema` points at
something *other* than the meta-schema is a **data file bound to a schema**, not
a schema. That is true regardless of its name or shape — it is what makes inline
binding work.

So if your schema isn't recognised, either rename it to `*.schema.json`, or add
its `$schema` line — the linter offers **Insert $schema Declaration** as a quick
fix.

<!-- spec:F34 end -->

## The preview says Python is missing

**Python is optional.** Set
[`jsonschema.preview.renderer`](/guide/configuration#jsonschema-preview-renderer)
to `"builtin"` to always use the dependency-free built-in renderer and skip the
interpreter probe and install prompt entirely.

Left at its default (`"auto"`) the preview still renders without Python — just
with a simpler layout. If you *want* the richer
[json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans)
output, install it yourself:

```sh
python3 -m pip install --user json-schema-for-humans
# or, in a virtual environment:
python3 -m venv .venv && .venv/bin/pip install json-schema-for-humans
```

## I get a red squiggle on `$schema` and no IntelliSense

That is VS Code's own JSON language server failing to fetch a schema it can't
authenticate to. The extension can fetch it for you:

1. **JSON Schema: Configure Schema Authentication…** — GitHub OAuth, a Bearer
   token, or Basic auth.
2. **JSON Schema: Cache Schema Locally** — downloads it and repoints the
   `json.schemas` / `yaml.schemas` entry at the local copy, so the built-in
   language servers read it too.

See [Authentication](/guide/authentication).

## Validation says "no schema bound" but the file has `$schema`

Check that the `$schema` value resolves. A relative path is resolved against the
*data file's* directory, not the workspace root. Ctrl+click it: if it doesn't
navigate, it doesn't resolve.

## Commands are missing in an untrusted workspace

Preview, inline binding, bundling and code generation are disabled in Restricted
Mode by design — see [Workspace Trust](/guide/security#workspace-trust). Trust
the folder to get them back.

## Validation is slower than I expect on a big workspace

**Validate Workspace** caps its scan at
[`jsonschema.workspaceValidation.maxFiles`](/guide/configuration#jsonschema-workspacevalidation-maxfiles)
(default 2000), skips files over 1 MiB, and respects `files.exclude` /
`search.exclude`. The report says when it truncated.

## A remote schema seems out of date

The local cache is not revalidated automatically unless you ask it to be. Either
run **JSON Schema: Refresh Schema Cache**, or set
[`jsonschema.cache.autoRefresh`](/guide/configuration#jsonschema-cache-autorefresh)
to `onOpen` or `daily`.

## An AI command does nothing

AI assistance is **off by default**. Set `jsonschema.ai.enabled` to `true`, or
accept the prompt the command shows. If it is on and you still get "no language
model is available", sign in to a provider (for example GitHub Copilot) — this
extension deliberately ships no model of its own. See [AI assistance](/guide/ai).

## Something else

Check the Output channel first, then
[open an issue](https://github.com/samdidos/vscode-json-schema-preview/issues)
with the log excerpt and a minimal schema that reproduces it.
