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
- **F07-FR-15** A **404** response from a GitHub host (`raw.githubusercontent.com`,
  `api.github.com`, or any `*.github.com`/`*.githubusercontent.com` subdomain)
  MUST also be surfaced as `AuthRequiredError` when the request carried no
  `Authorization` header — GitHub returns 404, not 401/403, for private-repo
  content when the caller is unauthenticated, specifically so existence can't
  be inferred without access. A 404 on a request that *did* carry an
  `Authorization` header MUST remain a plain not-found error (the credential
  may simply lack access to that path, and re-offering Configure Auth would be
  misleading). Non-GitHub hosts are unaffected: their 404s always stay
  not-found, since this ambiguity is a GitHub-specific convention.
- **F07-FR-14** When stored credentials are attached to a plain-`http://` URL
  the extension MUST warn the user that the credential is sent unencrypted,
  at most once per host per session. The request MUST still proceed — the
  warning informs, it does not block.

### Discoverability

- **F07-FR-10** A **🔒 / 🔓 status bar item** MUST be visible when the active
  file has a remote `$schema`. It MUST indicate whether credentials are
  configured for the schema's host. To stay compact the item's label MUST be
  **icon-only** (🔒 when configured, 🔓 otherwise); the schema **host** MUST be
  shown in the item's **tooltip** rather than in its label, so the item does
  not widen with the host's domain length.
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

## History

- 2026-07-19 — Added F07-FR-14: warn (once per host per session, non-blocking)
  when credentials are sent over plain `http://`.
- 2026-07-22 — Added F07-FR-15: an unauthenticated 404 from a GitHub host is
  treated as authentication-required, since GitHub returns 404 (not 401/403)
  for private-repo content without access — previously this silently produced
  a plain not-found error with no Configure Auth offer.
