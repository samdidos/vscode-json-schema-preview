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
3. Click the **Preview** icon or run **JSON Schema: Preview** from the Command Palette.

The preview panel opens beside your editor and re-renders every time you save.

The panel includes a **Download** button (bottom-right corner) that saves the generated output — HTML or Markdown depending on the active template — to a file of your choice.

External links inside the rendered documentation open in your default browser.

## Requirements

- VS Code **≥ 1.96.0**
- **Python 3** on your `PATH` with the `json-schema-for-humans` package:

```bash
pip install json-schema-for-humans
```

The extension checks for the package on startup and shows a notification if it is missing.

## Workspace Trust

The preview renders by calling a local Python tool, so it is **disabled in untrusted workspaces** (VS Code's Restricted Mode). The extension is declared as `untrustedWorkspaces: limited` in its manifest:

| Feature | Trusted | Untrusted |
|---|---|---|
| Preview / live update | ✅ | ❌ (warning shown) |
| Validation | ✅ | ✅ |
| Schema binding | ✅ | ✅ |
| Schema inference | ✅ | ✅ |
| Auth configuration | ✅ | ✅ |

If the preview command is run in an untrusted workspace a warning is displayed with a **Manage Workspace Trust** button.

## Auto-Open Preview

Enable [`jsonschema.preview.autoOpen`](/guide/configuration#jsonschema-preview-autoopen) in settings to open the preview panel automatically whenever a schema file becomes the active editor.

## Live Preview

Enable [`jsonschema.preview.liveUpdate`](/guide/configuration#jsonschema-preview-liveupdate) to refresh the preview as you type (debounced). The preview panel must already be open.
