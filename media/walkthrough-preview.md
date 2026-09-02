## Preview a schema

1. Open a `.json` or `.yaml` JSON Schema.
2. Click the **eye** icon in the editor toolbar, or press <kbd>Ctrl</kbd>+<kbd>K</kbd> <kbd>V</kbd> (<kbd>⌘K V</kbd> on macOS).

The panel renders the schema as navigable documentation and refreshes on save.
Scroll either side and the other follows.

**Python is optional.** The richer renderer uses `json-schema-for-humans` when a
Python interpreter has it; without it, a built-in dependency-free renderer is
used instead.
