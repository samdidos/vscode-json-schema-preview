# Change Log

All notable changes to the "json-schema-preview" extension will be documented in this file.

## [0.7.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.6.0...v0.7.0) (2026-07-13)


### Features

* **docs:** add demo-GIF pipelines for 5 previously-uncovered features ([f9d3bba](https://github.com/samdidos/vscode-json-schema-preview/commit/f9d3bba3703ecff8348170755dc6ab753c665fb3))


### Bug Fixes

* **e2e:** allowlist new demo fixture schemas in showcase/schemas/.gitignore ([f1b4a10](https://github.com/samdidos/vscode-json-schema-preview/commit/f1b4a1010c65db137d0aece8d4f131cd6de0b894))
* **e2e:** land ref-navigation go-to-definition inside the $ref string's range ([203662c](https://github.com/samdidos/vscode-json-schema-preview/commit/203662ca8bd493fc84689adc3d72622ef23370b9))
* **e2e:** use ArrowLeft, not Left, for the ref-navigation cursor nudge ([5175665](https://github.com/samdidos/vscode-json-schema-preview/commit/5175665ba15957544dd50fa492148305d478bbca))

## [0.6.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.5.1...v0.6.0) (2026-07-12)


### Features

* **codegen:** folder destination for multi-file targets (Java) ([b3bf647](https://github.com/samdidos/vscode-json-schema-preview/commit/b3bf6478b758c5643b6e5670c72fe1983e27ca8e))
* **codegen:** generate TypeScript types from a schema (F18) ([bbd4d24](https://github.com/samdidos/vscode-json-schema-preview/commit/bbd4d24b7a3017a91b550957a0eb2005b8bad388))
* **codegen:** multi-language targets and a save-to-file destination (F18-FR-10/11) ([4c45760](https://github.com/samdidos/vscode-json-schema-preview/commit/4c457607562bbe395ce30b01f7b96edf9984b8b8))
* **docs:** add a Generate Types (F18) demo GIF pipeline + website tab ([e0c4275](https://github.com/samdidos/vscode-json-schema-preview/commit/e0c4275704dccbd9cae2560868aae7260569468c))
* **docs:** modernize the website with a gradient hero, hover effects, and scroll reveal ([33d34da](https://github.com/samdidos/vscode-json-schema-preview/commit/33d34daae69655ecfc88071412fe3a4f68709e18))
* **docs:** replace hero logo hover animation with a drifting starfield ([512436e](https://github.com/samdidos/vscode-json-schema-preview/commit/512436e5573785930eb07ee5fc62e831c6c679f0))
* **preview:** add jsonschema.preview.renderer to force the built-in renderer (F01-FR-27) ([c9e222a](https://github.com/samdidos/vscode-json-schema-preview/commit/c9e222aa41cad34d9268932a258a203970663d62))
* **status-bar:** keep binding and auth status items compact (F04-FR-06, F07-FR-10) ([161fd1f](https://github.com/samdidos/vscode-json-schema-preview/commit/161fd1fb273c5137ed073648b0ec650d0cdc2e14))
* **toml:** schema-driven IntelliSense for bound TOML files (F19) ([554b03e](https://github.com/samdidos/vscode-json-schema-preview/commit/554b03e970b2efeb0788ba64838f8eaf1d02197d))
* **traceability:** fail doc check when docs tag unimplemented specs (S07-SR-09) ([b07b0f3](https://github.com/samdidos/vscode-json-schema-preview/commit/b07b0f304fb82f3ce31efc33da9c1cd8edb1c5b9))
* **workspace:** whole-workspace validation report command (F20) ([35cc51f](https://github.com/samdidos/vscode-json-schema-preview/commit/35cc51f7d4baa4216745978c3b1f0cbe30b3dd91))


### Bug Fixes

* **e2e:** locate auth status-bar item by codicon, not host text ([4b26fbe](https://github.com/samdidos/vscode-json-schema-preview/commit/4b26fbee92a3aac5269d29f9b9bd9ed75af67941))
* **security:** anchor host assertions in schemaAuthStatusBar tests ([5ad05ab](https://github.com/samdidos/vscode-json-schema-preview/commit/5ad05abbc3e2c73714fb70a9e738e44a5152a768))
* **security:** assert exact tooltip text instead of substring/regex match ([2abed0c](https://github.com/samdidos/vscode-json-schema-preview/commit/2abed0c43130e6f6d7c9ca182a240c9b58460f5d))
* **security:** eliminate a file-system TOCTOU race and a dead import ([7f61f7e](https://github.com/samdidos/vscode-json-schema-preview/commit/7f61f7e74c78a693ca0e919de6c65a3b583a16a2))
* **security:** remove RegExp built from data-file content; dedupe ref resolution ([8a9502e](https://github.com/samdidos/vscode-json-schema-preview/commit/8a9502eb0428d5d5389dcf2d7e20530b8c104885))
* **validation:** select AJV dialect by the schema's declared draft (F03-FR-15) ([a9f3dc8](https://github.com/samdidos/vscode-json-schema-preview/commit/a9f3dc8c136abfb480b43b165f35bd3af74a89cb))
* **validation:** tag diagnostics with source "JSON Schema" (F03-FR-08) ([a980c8a](https://github.com/samdidos/vscode-json-schema-preview/commit/a980c8af6e742a37173b76ee40066ea43c901c75))

## [0.5.1](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.5.0...v0.5.1) (2026-07-08)


### Bug Fixes

* **ci:** grant resolve-tag contents:write so it can see draft releases ([dd85330](https://github.com/samdidos/vscode-json-schema-preview/commit/dd85330a36e2e8343fa14c84e5839f00c856550d))

## [0.5.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.4.0...v0.5.0) (2026-07-08)


### Features

* **bundle:** implement F14 schema bundling & dereferencing ([7d4c679](https://github.com/samdidos/vscode-json-schema-preview/commit/7d4c6790f5ba0535a70d5e39499d8f3b72bc5529))
* **catalog:** implement F12 schema catalog & registry binding ([7590b22](https://github.com/samdidos/vscode-json-schema-preview/commit/7590b22f7de2fe1bdcc6ad949c51997c2faf94c5))
* **diff:** implement F15 schema diff & breaking-change detection ([e04bb1e](https://github.com/samdidos/vscode-json-schema-preview/commit/e04bb1e8e8603923b1c11ee2ed8fd9d07648285a))
* **docs:** implement S07 documentation traceability with spec: tags ([6a64405](https://github.com/samdidos/vscode-json-schema-preview/commit/6a64405825f18ebe7525e4633cc28b0f998d0fd9))
* implement F13 $ref navigation, F16 sample data, F17 linting, F08 cache freshness ([22b1248](https://github.com/samdidos/vscode-json-schema-preview/commit/22b12488d0165bffcc0c22b434dddad1979f4a23))
* **test:** implement S08 real-VS-Code integration test suite ([dadb85d](https://github.com/samdidos/vscode-json-schema-preview/commit/dadb85d698c3a6e69217b1fb4fa28d98182c010f))
* **toml:** implement F11 TOML data-file support ([01bbefe](https://github.com/samdidos/vscode-json-schema-preview/commit/01bbefed10793da599b04d72fbd746111d4cac20))


### Bug Fixes

* **binding:** resolve multi-root scope reads and escape TOML inline paths ([04b2348](https://github.com/samdidos/vscode-json-schema-preview/commit/04b23489f0f6b23851fe7b1a04c13df01eed851c))
* **binding:** store absolute path when schema is in a different workspace folder ([e6bce1f](https://github.com/samdidos/vscode-json-schema-preview/commit/e6bce1f5d5fcabc5019a2becb7c16a57abf54424))
* **ref:** correct cached-remote language, dedup fetches, reduce re-parsing ([6338d38](https://github.com/samdidos/vscode-json-schema-preview/commit/6338d38102e128f42a06fd5a6f2dd35efef3f6bc))
* **S08:** green the integration suite — real bugs the first CI run surfaced ([df25047](https://github.com/samdidos/vscode-json-schema-preview/commit/df2504791f32cd4fabfa70c2fec7679c8be7b26a))
* **S08:** resolve integration-suite failures found in first real CI run ([2a22975](https://github.com/samdidos/vscode-json-schema-preview/commit/2a22975f7227c2e9fd8582d70f36a45d91959392))
* **security:** address CodeQL alerts — cache write taint, TOCTOU, ReDoS ([832702a](https://github.com/samdidos/vscode-json-schema-preview/commit/832702a34ce950dcbb4d145445184bb7e1e1eb37))
* **security:** suppress remaining CodeQL false positives after F08-FR-18/19 ([ca30ed9](https://github.com/samdidos/vscode-json-schema-preview/commit/ca30ed91d8b7dae5901d7c4962ea1f58cc865aa2))
* **test:** correct out/ vs src/ path resolution in the integration suite ([8b1f432](https://github.com/samdidos/vscode-json-schema-preview/commit/8b1f432a1aa853a009fef24ba90299aa23b808d9))

## [0.4.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.3.1...v0.4.0) (2026-07-06)


### Features

* **binding:** add inline $schema binding scope and fix workspace-scope paths ([712887c](https://github.com/samdidos/vscode-json-schema-preview/commit/712887cc77b8c325d1c6584db788287b33328297))
* **config:** make render and remote-fetch timeouts user-configurable ([3d7b797](https://github.com/samdidos/vscode-json-schema-preview/commit/3d7b797b570430a0ffe5f23db5b64aad28635ff2))
* **maturity:** compute the maturity score from repo facts, not judgement ([d6e31ff](https://github.com/samdidos/vscode-json-schema-preview/commit/d6e31ff2a14b609f0447d9796359769ae449b9b1))
* **maturity:** fold in the live OpenSSF Scorecard grade as an optional cached check ([a76083a](https://github.com/samdidos/vscode-json-schema-preview/commit/a76083a8db795e10da55995295a2cf74c696e787))
* **preview:** built-in pure-JS fallback renderer when Python is unavailable ([9bfbbe0](https://github.com/samdidos/vscode-json-schema-preview/commit/9bfbbe06c8f13082842cd833c9d2329a11a897ab))
* **reliability:** fall back to stale cached schema when remote is unreachable ([326170e](https://github.com/samdidos/vscode-json-schema-preview/commit/326170edc93fe87f1de22c5e7968f2854f7ec134))


### Bug Fixes

* **ci:** retry the draft-release check for a GitHub propagation race ([1d3ffe2](https://github.com/samdidos/vscode-json-schema-preview/commit/1d3ffe255d97c727644cc0363dd1d8e8346770c5))
* **maturity:** make maturity:check deterministic across Node versions ([c7a8251](https://github.com/samdidos/vscode-json-schema-preview/commit/c7a8251d3d3cbdbb693a6f3d0a87da5cda5490b0))
* **security:** harden the OpenSSF fetch against CodeQL taint findings ([3b82db3](https://github.com/samdidos/vscode-json-schema-preview/commit/3b82db315279465f19d9ff52eb478cf38918422b))
* **security:** sanitise OSSF response fields with a charset allowlist ([2e65105](https://github.com/samdidos/vscode-json-schema-preview/commit/2e6510586680b956dad225e6b31b1f9d02084f18))

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
