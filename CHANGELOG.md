# Change Log

All notable changes to the "json-schema-preview" extension will be documented in this file.

## [0.3.1](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.3.0...v0.3.1) (2026-07-02)


### Bug Fixes

* **ci:** trigger a docs rebuild once the release is actually published ([32d41f4](https://github.com/samdidos/vscode-json-schema-preview/commit/32d41f40620f1f9e746aaf07aea48ce3576107da))
* **ci:** trigger publish.yml via workflow_run, not just push ([45cd38b](https://github.com/samdidos/vscode-json-schema-preview/commit/45cd38bf32d59e931e511ec473d60496241c9fca))

## [0.3.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.2.2...v0.3.0) (2026-07-02)


### Features

* **ci:** surface Refresh Demo GIFs as a status on the release PR ([93adcf6](https://github.com/samdidos/vscode-json-schema-preview/commit/93adcf6ad640a3277eb4afc555091024fc5e50f2))


### Bug Fixes

* **auth:** make credential lookup resilient to SecretStorage failures ([609f2e1](https://github.com/samdidos/vscode-json-schema-preview/commit/609f2e1a7c5f85a3d05401cd8b7474eebd2ddf88))
* **ci:** publish releases as drafts to work around Immutable Releases ([9e01b6d](https://github.com/samdidos/vscode-json-schema-preview/commit/9e01b6d589ad3a658169cd9f3b9aa3a878070918))
* **e2e:** isolate each demo in a fresh VS Code profile and workspace ([0e6942a](https://github.com/samdidos/vscode-json-schema-preview/commit/0e6942a648e7385814980eb8f97fa67a7828b3d3))
* **e2e:** un-ignore the seeded remote-person.json fixture ([f93bff9](https://github.com/samdidos/vscode-json-schema-preview/commit/f93bff984ae75557ee0f1207230e7f56907c2163))
* **e2e:** verify openFileVisible actually opens the file ([2ea26b2](https://github.com/samdidos/vscode-json-schema-preview/commit/2ea26b2794081f1a0de9cb7f60a0102960cb76df))
* **e2e:** wait for the auth status-bar text instead of a fixed sleep ([69514b6](https://github.com/samdidos/vscode-json-schema-preview/commit/69514b646104ff2c75eed6764dbbcb5b3569e17a))
* **lint:** exclude .vscode-test/ and other generated dirs from ESLint ([bb14143](https://github.com/samdidos/vscode-json-schema-preview/commit/bb14143c6c2db62a26863bf01ad0fc48915ce98f))

## [0.2.2](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.2.1...v0.2.2) (2026-07-01)


### Bug Fixes

* **publish:** remove SVG from readme ([2d7e665](https://github.com/samdidos/vscode-json-schema-preview/commit/2d7e665bf1403beb60022d4bb873acde80ad242a))

## [0.2.1](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.2.0...v0.2.1) (2026-07-01)


### Bug Fixes

* **publish:** set vscode types to latest ([110d0eb](https://github.com/samdidos/vscode-json-schema-preview/commit/110d0eb1d82c117ac1cd968480e754df768e2de6))

## [0.2.0](https://github.com/samdidos/vscode-json-schema-preview/compare/json-schema-preview-v0.1.0...json-schema-preview-v0.2.0) (2026-07-01)


### Features

* add JSON Schema Preview extension — full feature set ([#1](https://github.com/samdidos/vscode-json-schema-preview/issues/1)) ([29dd6d5](https://github.com/samdidos/vscode-json-schema-preview/commit/29dd6d530bd86b1165a6d43ca9274d7096f4af54))
* **e2e,docs:** fix sidebar, resize window, and redesign demo showcase ([af209af](https://github.com/samdidos/vscode-json-schema-preview/commit/af209af7b706c6065070343a57b8c9bb57d75439))
* **security:** gate preview generation on Workspace Trust ([04421a3](https://github.com/samdidos/vscode-json-schema-preview/commit/04421a39336399b70be11d187e2ffe5a04e93f5a))
* **security:** nonce-based CSP for all webviews ([1129097](https://github.com/samdidos/vscode-json-schema-preview/commit/11290970a68c9b1617b5af352f77767787eaf7ea))


### Bug Fixes

* address review findings in webview panels ([57d19f7](https://github.com/samdidos/vscode-json-schema-preview/commit/57d19f722f5a64cd2d1bf2a6f81c068ce72e21d9))
* **build:** exclude e2e files from root tsconfig to fix type-check ([2d39979](https://github.com/samdidos/vscode-json-schema-preview/commit/2d39979b37fe09717a8694e624f0d7e677d39809))
* clickable preview links, download button, and remove logo hover animation ([6aa79ec](https://github.com/samdidos/vscode-json-schema-preview/commit/6aa79ec3922d420439fb67d2e97fee7384c3f153))
* **e2e:** copy showcase to temp dir so tests never modify tracked files ([9c6a8f6](https://github.com/samdidos/vscode-json-schema-preview/commit/9c6a8f6164fc26b8a7de2d80382901b084956744))
* **e2e:** create demo temp dirs with mkdtempSync (CodeQL insecure-temp-file) ([60f25cd](https://github.com/samdidos/vscode-json-schema-preview/commit/60f25cdf39727f94b1faeb8478dd4a77192b1d4e))
* format-aware download button for all json_schema_for_humans templates ([9390d41](https://github.com/samdidos/vscode-json-schema-preview/commit/9390d4188b554bed25c7f7287e32663ceafb135c))
* schema binding scopes, path correctness, and session cleanup ([d9caad3](https://github.com/samdidos/vscode-json-schema-preview/commit/d9caad398c6f23400d5897d7dcabcf0889804146))
* **security:** coerce scroll positions and validate openExternal scheme ([f14d202](https://github.com/samdidos/vscode-json-schema-preview/commit/f14d20238698bb874016b2c0008f52d66d68e11d))
* **security:** escape data interpolated into webview HTML/script ([2cbb3b7](https://github.com/samdidos/vscode-json-schema-preview/commit/2cbb3b7fef22387eee724cd35847d90d68a800f1))


### Performance Improvements

* async workspace-schema discovery; track editor webview disposables ([9196e30](https://github.com/samdidos/vscode-json-schema-preview/commit/9196e30bda2bcb003ad29538b7a22225d38ed215))

## [0.2.0](https://github.com/samdidos/vscode-json-schema-preview/compare/json-schema-preview-v0.1.0...json-schema-preview-v0.2.0) (2026-06-27)


### Features

* add JSON Schema Preview extension — full feature set ([#1](https://github.com/samdidos/vscode-json-schema-preview/issues/1)) ([29dd6d5](https://github.com/samdidos/vscode-json-schema-preview/commit/29dd6d530bd86b1165a6d43ca9274d7096f4af54))
* **e2e,docs:** fix sidebar, resize window, and redesign demo showcase ([af209af](https://github.com/samdidos/vscode-json-schema-preview/commit/af209af7b706c6065070343a57b8c9bb57d75439))
* **security:** gate preview generation on Workspace Trust ([04421a3](https://github.com/samdidos/vscode-json-schema-preview/commit/04421a39336399b70be11d187e2ffe5a04e93f5a))
* **security:** nonce-based CSP for all webviews ([1129097](https://github.com/samdidos/vscode-json-schema-preview/commit/11290970a68c9b1617b5af352f77767787eaf7ea))


### Bug Fixes

* address review findings in webview panels ([57d19f7](https://github.com/samdidos/vscode-json-schema-preview/commit/57d19f722f5a64cd2d1bf2a6f81c068ce72e21d9))
* **build:** exclude e2e files from root tsconfig to fix type-check ([2d39979](https://github.com/samdidos/vscode-json-schema-preview/commit/2d39979b37fe09717a8694e624f0d7e677d39809))
* clickable preview links, download button, and remove logo hover animation ([6aa79ec](https://github.com/samdidos/vscode-json-schema-preview/commit/6aa79ec3922d420439fb67d2e97fee7384c3f153))
* **e2e:** copy showcase to temp dir so tests never modify tracked files ([9c6a8f6](https://github.com/samdidos/vscode-json-schema-preview/commit/9c6a8f6164fc26b8a7de2d80382901b084956744))
* format-aware download button for all json_schema_for_humans templates ([9390d41](https://github.com/samdidos/vscode-json-schema-preview/commit/9390d4188b554bed25c7f7287e32663ceafb135c))
* schema binding scopes, path correctness, and session cleanup ([d9caad3](https://github.com/samdidos/vscode-json-schema-preview/commit/d9caad398c6f23400d5897d7dcabcf0889804146))
* **security:** coerce scroll positions and validate openExternal scheme ([f14d202](https://github.com/samdidos/vscode-json-schema-preview/commit/f14d20238698bb874016b2c0008f52d66d68e11d))
* **security:** escape data interpolated into webview HTML/script ([2cbb3b7](https://github.com/samdidos/vscode-json-schema-preview/commit/2cbb3b7fef22387eee724cd35847d90d68a800f1))


### Performance Improvements

* async workspace-schema discovery; track editor webview disposables ([9196e30](https://github.com/samdidos/vscode-json-schema-preview/commit/9196e30bda2bcb003ad29538b7a22225d38ed215))

## [0.1.X]

- Initial releases
