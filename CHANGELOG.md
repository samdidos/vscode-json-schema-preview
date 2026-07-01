# Change Log

All notable changes to the "json-schema-preview" extension will be documented in this file.

## [0.2.2](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.2.1...v0.2.2) (2026-07-01)


### Bug Fixes

* **publish:** remove SVG from readme ([b012794](https://github.com/samdidos/vscode-json-schema-preview/commit/b01279497dd953410cfe05d8fafb51146f2717b4))

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
