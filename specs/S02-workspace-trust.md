# S02 — Workspace Trust Integration

## Overview

The extension is declared as `untrustedWorkspaces: limited` in its manifest
because the preview feature shells out to a local Python interpreter, which
represents an arbitrary code execution vector in untrusted workspaces.

## Requirements

### Manifest Declaration

- **S02-SR-01** The extension manifest MUST declare
  `capabilities.untrustedWorkspaces.supported = "limited"` with a description
  explaining that preview is disabled in untrusted workspaces.
- **S02-SR-02** The extension manifest MUST declare
  `capabilities.virtualWorkspaces.supported = false` because the extension
  requires disk access and a local Python interpreter.

### Preview and Live Update

- **S02-SR-03** `openJsonSchema` MUST check `vscode.workspace.isTrusted` before
  calling `generateDocHTML`.
- **S02-SR-04** When the workspace is untrusted and the command is invoked
  explicitly (not via auto-preview) the extension MUST show a warning message
  explaining why preview is disabled and MUST offer a **Manage Workspace Trust**
  button that calls `workbench.trust.manage`.
- **S02-SR-05** When the workspace is untrusted and the command is invoked via
  auto-preview (`silent = true`) the extension MUST return silently without
  showing any notification.
- **S02-SR-06** `scheduleLiveUpdate` MUST be a no-op in untrusted workspaces.

### Permitted in Untrusted Workspaces

- **S02-SR-07** Schema **validation** (AJV, no Python subprocess) MUST work in
  untrusted workspaces.
- **S02-SR-08** Schema **binding** (reads/writes VS Code settings) MUST work in
  untrusted workspaces.
- **S02-SR-09** Schema **inference** (pure JS via genson-js) MUST work in
  untrusted workspaces.
- **S02-SR-10** Auth **configuration** (credential storage) MUST work in
  untrusted workspaces.

## Acceptance Criteria

1. Launching VS Code in Restricted Mode and running **JSON Schema: Preview** shows
   the workspace trust warning — not a Python error.
2. **Validate This File** and **Bind Schema…** work normally in Restricted Mode.
