// Client-safe constants (no node imports — these components ship to the
// browser): base URLs for linking a repository file or commit from the docs site.
export const REPO_BLOB_URL =
  'https://github.com/samdidos/vscode-json-schema-preview/blob/main'
export const REPO_COMMIT_URL = REPO_BLOB_URL.replace(/\/blob\/[^/]+$/, '/commit')
