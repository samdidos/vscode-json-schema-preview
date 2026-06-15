# Introduction

**JSON Schema Preview** is a VS Code extension that turns JSON Schema files (`.json` or `.yaml`/`.yml`) into live, human-readable documentation panels — with built-in validation, a visual form editor, and schema inference.

## Installation

Install from the VS Code Marketplace:

1. Open **VS Code**
2. Press <kbd>Ctrl</kbd>+<kbd>P</kbd> (or <kbd>⌘P</kbd> on macOS)
3. Run:

```
ext install samdidos.json-schema-preview
```

Or search for **"JSON Schema Preview"** in the Extensions panel (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).

## Opening a Preview

1. Open any `.json` or `.yaml` file whose root object contains a `$schema` key.
2. The editor toolbar shows three icons: **Edit**, **Preview**, and **Configure**.
3. Click the **Preview** icon (eye) or run **JSON Schema: Preview** from the Command Palette.

The preview panel opens beside your editor and re-renders every time you save.

## Requirements

- VS Code **≥ 1.66**
- **Python 3** on your `PATH` with the `json-schema-for-humans` package:

```bash
pip install json-schema-for-humans
```

The extension checks for the package on startup and shows a notification if it is missing.

## Auto-Open Preview

Enable [`jsonschema.preview.autoOpen`](/guide/configuration#jsonschema-preview-autoopen) in settings to open the preview panel automatically whenever a schema file becomes the active editor.

## Live Preview

Enable [`jsonschema.preview.liveUpdate`](/guide/configuration#jsonschema-preview-liveupdate) to refresh the preview as you type (debounced). The preview panel must already be open.
