## Bind and validate

1. Open a data file — JSON, JSONC, JSONL, YAML or TOML.
2. Run **JSON Schema: Bind Schema…** and pick a schema, or search SchemaStore
   from **Browse catalog…**.
3. Press <kbd>Ctrl</kbd>+<kbd>K</kbd> <kbd>J</kbd> (<kbd>⌘K J</kbd>) to validate.

Errors appear in the Problems panel on their real line and column. Where the fix
is unambiguous — a missing required property, an unexpected key, a value outside
an `enum` — a lightbulb offers it, with the closest enum value ranked first.
