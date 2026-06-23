# F07 — Remote Schema Authentication

## Overview

The extension can fetch JSON Schema files from private HTTPS endpoints using
credentials stored securely in the OS keychain. It supports GitHub OAuth, Bearer
tokens, and Basic auth.

## User Stories

- As a developer using schemas from a private GitHub repo, I want to authenticate
  with my existing VS Code GitHub session without copying tokens.
- As an enterprise developer using Artifactory, I want to store a Bearer token
  once and have the extension use it automatically.
- As a developer, I want VS Code's language server to stop showing a red squiggle
  for private schemas after I configure auth.

## Functional Requirements

### Configure Auth Command

- **F07-FR-01** The command `jsonschema.configureSchemaAuth` MUST present a Quick
  Pick of authentication methods for the URL associated with the active file's
  schema.
- **F07-FR-02** If the active file has no remote `$schema` URL the command MUST
  prompt the user for a URL.
- **F07-FR-03** If the URL is not a remote URL (i.e. not `http://` or `https://`)
  the command MUST show an informational message and return.

### Authentication Methods

- **F07-FR-04** **GitHub OAuth** — the extension MUST obtain a GitHub OAuth token
  through VS Code's built-in GitHub authentication provider (no user-visible token).
- **F07-FR-05** **Bearer token** — the user MUST be prompted to enter a token;
  the token MUST be stored in VS Code's Secret Storage (OS keychain), not in
  plaintext settings.
- **F07-FR-06** **Basic auth** — the user MUST be prompted for a username and
  password; both MUST be stored in Secret Storage.

### Credential Storage and Retrieval

- **F07-FR-07** Credentials MUST be keyed by hostname so one set covers all paths
  under the same host.
- **F07-FR-08** When fetching a remote schema the extension MUST automatically
  apply the stored credentials for the schema's host.
- **F07-FR-09** If a fetch returns 401 or 403 the extension MUST surface an
  `AuthRequiredError` with the URL so the caller can offer the Configure Auth
  flow.

### Discoverability

- **F07-FR-10** A **🔒 / 🔓 status bar item** MUST be visible when the active
  file has a remote `$schema`. It MUST indicate whether credentials are
  configured for the schema's host.
- **F07-FR-11** When VS Code cannot load a remote schema a **code action
  (lightbulb)** MUST appear on the `$schema` line offering to configure auth.
- **F07-FR-12** When the **Validate This File** command returns a 401/403, the
  error notification MUST include a **Configure Auth** button.

### Post-Configuration

- **F07-FR-13** After auth is successfully configured the extension SHOULD offer
  to cache the schema locally (see F08) with a **Cache Schema** button.

## Non-Functional Requirements

- **F07-NFR-01** Credentials MUST be stored via `vscode.SecretStorage`; they
  MUST NOT be written to `settings.json` or any other plaintext file.
- **F07-NFR-02** Token values MUST NOT appear in log output.

## Acceptance Criteria

1. Running **Configure Schema Authentication…** and selecting GitHub OAuth
   completes without prompting for a token on machines already signed into GitHub
   in VS Code.
2. Running the command with no remote schema URL shows an information message.
