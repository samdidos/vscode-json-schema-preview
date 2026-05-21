# JSON Schema Preview

Preview JSON Schema documents inside VS Code, rendered as readable HTML documentation.

## Requirements

Python must be available on your `PATH`. The extension automatically installs
[json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) on
first use via `pip` — no manual setup needed.

## Usage

Open any `.json` or `.yaml` / `.yml` file that contains a `$schema` field.
A **Preview** button (eye icon) appears in the editor title bar. Click it to
open the rendered documentation in a side panel.

You can also open the Command Palette (`Shift+Cmd+P` / `Shift+Ctrl+P`) and run
**JSON Schema: Preview**.

## Features

- Renders JSON Schema as structured HTML documentation
- Supports both JSON and YAML schema files
- Auto-reloads the preview when the file is saved
- Remembers scroll position across reloads
- Works with local `$ref` definitions

## Credits

Rendering powered by [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans).
