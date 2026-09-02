## Schemas behind authentication

When a schema needs credentials, VS Code's language server can't fetch it: you
get a red squiggle and IntelliSense goes dark.

1. Run **JSON Schema: Configure Schema Authentication…**
2. Choose GitHub OAuth (uses your existing VS Code session), a Bearer token, or
   Basic auth. Credentials go to your OS keychain, and are only ever sent to the
   host they were saved for.
3. Run **JSON Schema: Cache Schema Locally** so the built-in JSON and YAML
   language servers see the schema too — squiggle gone, IntelliSense back.
