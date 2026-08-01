# Change Log

All notable changes to the "json-schema-preview" extension will be documented in this file.

## [0.17.1](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.17.0...v0.17.1) (2026-08-01)


### Bug Fixes

* **dora:** refresh dora.json for the v0.17.0 release ([8922df2](https://github.com/samdidos/vscode-json-schema-preview/commit/8922df2edaf7570d9a0ebd62dedb1ab27ffe9e51))
* refresh dora.json and reorder DORA recompute before tests ([e86670f](https://github.com/samdidos/vscode-json-schema-preview/commit/e86670fd4129e9545cdfd668a80928558aadd0a5))

## [0.17.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.16.0...v0.17.0) (2026-07-27)


### Features

* **docs:** add requirement lifecycle stamps and publish the mutation score ([c015639](https://github.com/samdidos/vscode-json-schema-preview/commit/c01563955a2631fe8e98c6ad4285ca03aac78607))
* **docs:** chart estimate ageing and demo coverage on the insights page ([9d66f9b](https://github.com/samdidos/vscode-json-schema-preview/commit/9d66f9bb75c31d1b33ea045b1d1b2871a846c12c))
* **docs:** make the spec matrix sortable by column ([f8b61ab](https://github.com/samdidos/vscode-json-schema-preview/commit/f8b61ab69a75865526a09601b38f39e0a9e7e664))
* **docs:** replace the insights RICE table with charts, move the bar into the matrix ([862bd6a](https://github.com/samdidos/vscode-json-schema-preview/commit/862bd6a2f91485b6bb954733bfca6c1aa5f161d9))
* **hooks:** add SessionStart reminder to keep PR branches rebased and green ([a67764b](https://github.com/samdidos/vscode-json-schema-preview/commit/a67764b779c80b24045f58b0b0beac5f4e462c7a))
* **preview:** support jsonschema.config VS Code setting as config alternative ([8c17c6a](https://github.com/samdidos/vscode-json-schema-preview/commit/8c17c6ac35a6a499db4f0b9320d52bf93bb1aff1))
* **S10:** add a Release column to the spec matrix ([6620c3a](https://github.com/samdidos/vscode-json-schema-preview/commit/6620c3a278f9078016f19bdcaabbc91d2cd88c40))
* **S10:** add Created and Updated columns to the spec matrix ([92bd421](https://github.com/samdidos/vscode-json-schema-preview/commit/92bd42173ee2b1bca3239fdd4e7d6fb192a0761c))
* **specs:** attribute defects via a Fixes: commit trailer, and close CI gaps ([efd676d](https://github.com/samdidos/vscode-json-schema-preview/commit/efd676d355170ba293cbffa3990495bc89c3861a))
* **specs:** per-spec change history, release-scoped demo/GIF selection, concurrent verify gate ([a647c5d](https://github.com/samdidos/vscode-json-schema-preview/commit/a647c5dfbbfdf1e07ac35977ccf473d2a634be85))


### Bug Fixes

* **ci:** make the maturity step block on a broken scorer, not on a moved score ([a39344d](https://github.com/samdidos/vscode-json-schema-preview/commit/a39344de586c6efc6efc17ae97b149084f22640d))
* **ci:** stop reporting failed jobs as green, and earn the check back ([451ae7b](https://github.com/samdidos/vscode-json-schema-preview/commit/451ae7b1d2d763414dd4c13e8caec565bf3bf9a2))
* **docs:** fetch full git history so per-spec change history is correct ([4633cea](https://github.com/samdidos/vscode-json-schema-preview/commit/4633cea272abb942b698f046fe5c14204b0cf2ae))
* **dora:** refresh delivery metrics on release, not on an unrelated weekly clock ([bb1fb76](https://github.com/samdidos/vscode-json-schema-preview/commit/bb1fb7661f0daf17e022b399ba2edf1840e33678))
* **maturity:** stop five checks scoring a silent zero, and publish the score ([b4e0cee](https://github.com/samdidos/vscode-json-schema-preview/commit/b4e0cee298280282a721c37756551ca78b4f00d4))
* **test:** compare dora.json freshness against the latest git tag, not package.json ([6615081](https://github.com/samdidos/vscode-json-schema-preview/commit/6615081af5c58457c04e5a635f7152fad8ce5deb))
* **test:** exempt generated artifacts from the probed-path assertion ([4c94984](https://github.com/samdidos/vscode-json-schema-preview/commit/4c9498455cb35b90313b1122859faecdd6cf55e5))

## [0.16.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.15.0...v0.16.0) (2026-07-25)


### Features

* **docs:** surface spec metrics in the matrix, sidebar and a new insights page ([8062968](https://github.com/samdidos/vscode-json-schema-preview/commit/80629687e06ea61cd12c3927a873a4cefec4e394))
* **F24:** ref graph node detail + recovered bundle origin ([b060d92](https://github.com/samdidos/vscode-json-schema-preview/commit/b060d9219e03fde94e710d0371283ee8746a6c13))
* **F27:** infer --to draft selection, coverage multi-file input ([19c8070](https://github.com/samdidos/vscode-json-schema-preview/commit/19c8070e14de8ce16a6c11402684fc8d90c412d9))
* **specs:** add advisory customer-value estimates per feature (S16) ([0c74297](https://github.com/samdidos/vscode-json-schema-preview/commit/0c74297efe9fa621f7a7aa75956d11dc71d26db1))

## [0.15.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.14.0...v0.15.0) (2026-07-24)


### Features

* **ref-graph:** resolve remote $refs in the $ref dependency graph ([f0c88eb](https://github.com/samdidos/vscode-json-schema-preview/commit/f0c88eb0e48c31f39005f038b036c239bad07666))
* **S09:** run actionlint locally too, closing the CI/local parity gap ([096341d](https://github.com/samdidos/vscode-json-schema-preview/commit/096341db4de8a4fc0f5835de8975c18b9e6e5074))
* **S15:** rewrite .claude/hooks/*.sh as Node (S15-SR-05) ([c5bee30](https://github.com/samdidos/vscode-json-schema-preview/commit/c5bee308d88c7c32ae5067c56dfa0bba2f8194c8))
* **S15:** rewrite bootstrap.sh and lint-workflows.sh as Node ([584aa1a](https://github.com/samdidos/vscode-json-schema-preview/commit/584aa1a2ec54b13f3501b750e8f3724feeede1de))
* **S15:** rewrite sync-readme-badges.py as Node (S15-SR-06) ([11ead20](https://github.com/samdidos/vscode-json-schema-preview/commit/11ead2031ffff3648c8aaf2daad82f412920f6d3))


### Bug Fixes

* **auth:** treat an unauthenticated GitHub 404 as auth-required ([c0d2269](https://github.com/samdidos/vscode-json-schema-preview/commit/c0d2269dade7faaf069555765fb94b3fd009bb17))
* **binding:** never hide the Generate Schema wand for an existing binding ([3a71cdc](https://github.com/samdidos/vscode-json-schema-preview/commit/3a71cdc838755f99ff3546f45638f0d466a223c1))
* **security:** anchor badge-URL regexes against arbitrary hosts ([2dae412](https://github.com/samdidos/vscode-json-schema-preview/commit/2dae4127e7d9be0c4f44e13d3e7b7d5435de6cf6))
* stop exporting refGraph's internal ExternalError type ([502518a](https://github.com/samdidos/vscode-json-schema-preview/commit/502518abf5e2acbe36c99d67b9217e96771d9c34))
* **typegen:** pin C# to Newtonsoft.Json and pin non-just-types defaults with snapshot tests ([#129](https://github.com/samdidos/vscode-json-schema-preview/issues/129)) ([d9cd38c](https://github.com/samdidos/vscode-json-schema-preview/commit/d9cd38cdb6ea0b9fe1a3d20c81d070b7c1f68918))

## [0.14.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.13.0...v0.14.0) (2026-07-22)


### Features

* **F27:** add infer, sample, types, coverage, workspace & graph CLI commands ([52278b3](https://github.com/samdidos/vscode-json-schema-preview/commit/52278b34f20468a934f007d13d65a1cf1f25d96c))
* **F27:** standalone json-schema-tools CLI over the pure core ([e321139](https://github.com/samdidos/vscode-json-schema-preview/commit/e32113974c7366d65029c1c78ddd85bda7f5c5c7))


### Bug Fixes

* **deps:** patch high-severity brace-expansion & js-yaml advisories; refresh maturity ([08ad77f](https://github.com/samdidos/vscode-json-schema-preview/commit/08ad77f4502ed40657495f49c04eaa03df941b7e))
* **deps:** patch high-severity fast-uri & linkify-it advisories ([fcd90c0](https://github.com/samdidos/vscode-json-schema-preview/commit/fcd90c0e0b4e2aa8628dd886ad0c1ec1f7a16ff4))

## [0.13.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.12.0...v0.13.0) (2026-07-20)


### Features

* **F07:** warn once per host when credentials are sent over plain http ([d01c114](https://github.com/samdidos/vscode-json-schema-preview/commit/d01c114f4cb88b4439278729507f89306f489ff9))
* **S07:** complexity-weighted documentation-depth metric + doc links on spec pages ([6c0d3ba](https://github.com/samdidos/vscode-json-schema-preview/commit/6c0d3ba386dd966a334b524bb33f3eebc51514e6))
* **S07:** evaluate per-spec complexity for the documentation expectation ([a9f8363](https://github.com/samdidos/vscode-json-schema-preview/commit/a9f8363c43503656278162a73abcc17a2cf2980b))
* **S12:** score history + evolution-over-time diagram on the docs site ([b9f9e1b](https://github.com/samdidos/vscode-json-schema-preview/commit/b9f9e1b2acfbff635b28d9a54618aca998e193ea))
* **S12:** visualize the maturity scorecard on the docs site ([e1c7d1e](https://github.com/samdidos/vscode-json-schema-preview/commit/e1c7d1e4076a08ae17cefa38b9cee1d4335fe637))
* **S13:** advisory per-spec effort estimates — points, T-shirt, hours ([671ed7d](https://github.com/samdidos/vscode-json-schema-preview/commit/671ed7de4575744edbc0f8fd9762f5cb951fa1a7))
* **S14:** delivery-performance (DORA) metrics + actionlint in CI ([6de3415](https://github.com/samdidos/vscode-json-schema-preview/commit/6de3415abdd208c7497dcdc4ad1803cfd8355c9c))


### Performance Improvements

* **S03:** load quicktype-core lazily as its own webpack chunk ([17a348f](https://github.com/samdidos/vscode-json-schema-preview/commit/17a348ff399f27e7acd46d043158211751c49b22))

## [0.12.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.11.0...v0.12.0) (2026-07-18)


### Features

* add a real-screen-recording showcase demo GIF, embedded in README ([#102](https://github.com/samdidos/vscode-json-schema-preview/issues/102)) ([ffb60e3](https://github.com/samdidos/vscode-json-schema-preview/commit/ffb60e3524d89871349f14f124ed98cf5ccc6774))
* **F24:** $ref dependency graph view ([5c95b81](https://github.com/samdidos/vscode-json-schema-preview/commit/5c95b817592be4f78450b87bedd57ba1a12a9763))
* **F26:** backward-compatibility verdict & CI gate for schema diff ([0cff56f](https://github.com/samdidos/vscode-json-schema-preview/commit/0cff56f486eb1f2b49d6c6850f1245e77ff75944))

## [0.11.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.10.0...v0.11.0) (2026-07-18)


### Features

* **F23:** schema coverage — unused-in-data lens ([b5d754f](https://github.com/samdidos/vscode-json-schema-preview/commit/b5d754f01240e9c786c4b71fce419a785ecfd0f5))
* **F25:** rank enum quick-fixes by nearest match ([f076b04](https://github.com/samdidos/vscode-json-schema-preview/commit/f076b04ae4459c90284fde9bf665bd181d7f15a1))
* **perf:** track and gate build size (S03-SR-15..S03-SR-18) ([97f23b8](https://github.com/samdidos/vscode-json-schema-preview/commit/97f23b8d6e833155f547fa60ab26852f08842122))

## [0.10.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.9.0...v0.10.0) (2026-07-17)


### Features

* **ci:** publish to VS Code Marketplace via Azure OIDC, gated by manual approval ([affa19b](https://github.com/samdidos/vscode-json-schema-preview/commit/affa19b50b870781db61dd0f306f3fd5e2b10bd8))
* **docs:** add Specs section — filterable requirement matrix and spec pages ([4835f19](https://github.com/samdidos/vscode-json-schema-preview/commit/4835f19a51ce9e6457b7ea880ef9cb28370e0386))
* **docs:** multi-select dropdown filters for the spec matrix ([f08a20e](https://github.com/samdidos/vscode-json-schema-preview/commit/f08a20e72c13f94ae0a30f8c59196a934dd195a7))
* **traceability:** schema for the matrix + TS types generated by our own F18 ([82703f5](https://github.com/samdidos/vscode-json-schema-preview/commit/82703f5193579f884030e15d3b7519af8d5b88f8))
* **traceability:** version the matrix schema via a major-version $id ([8ad6f5b](https://github.com/samdidos/vscode-json-schema-preview/commit/8ad6f5b979ce98079d8b0dd1c424cba41717f274))


### Bug Fixes

* **binding:** recognise auto bindings and refine schema affordances ([13edbff](https://github.com/samdidos/vscode-json-schema-preview/commit/13edbfff3e8e635b8231005a2fb6a0bd5ec78bff))
* **ci:** bind get-mi-user-id OIDC subject to a GitHub environment ([98298f1](https://github.com/samdidos/vscode-json-schema-preview/commit/98298f19ec5a8f78197f3b1226cdd69e3a39fe83))
* **e2e:** open quickfix/migrate fixtures via CLI args, not Quick Open ([93164ea](https://github.com/samdidos/vscode-json-schema-preview/commit/93164ea18b31ea67be52d46442ad43dc4482b1d7))
* **e2e:** reliably open subfolder-seeded files; jump to diagnostic via F8 ([6a33425](https://github.com/samdidos/vscode-json-schema-preview/commit/6a334251c6e85212f313329ce33308cbae5d63ab))
* **e2e:** retry Quick Open's row-wait with a longer timeout on CI ([2f8d1d4](https://github.com/samdidos/vscode-json-schema-preview/commit/2f8d1d47bd2ecde4f624af076e08beda35df0908))
* **hooks:** make check-coverage.sh fast (lint+typecheck, not full coverage) ([dd1b664](https://github.com/samdidos/vscode-json-schema-preview/commit/dd1b66441c053a3dbe329afbd92e4143529e77f9))

## [0.9.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.8.0...v0.9.0) (2026-07-15)


### Features

* add validation quick-fixes (F21) and draft migration (F22) ([2f8a89d](https://github.com/samdidos/vscode-json-schema-preview/commit/2f8a89d1dc078051c4732ecb8a6fa146e890b6cb))
* **F04:** reflect natively-resolved schemas in the binding status bar ([88c55f9](https://github.com/samdidos/vscode-json-schema-preview/commit/88c55f98b96b1aa51589058d92a73178e24e0857))


### Bug Fixes

* **ci:** editor focus before Find in demo-quickfix; retry Windows file locks ([27adae4](https://github.com/samdidos/vscode-json-schema-preview/commit/27adae412e6b84e939af7979d6e94ff3a9aedba2))
* **e2e:** drive demo-quickfix's cursor entirely via keyboard, not DOM text ([a713702](https://github.com/samdidos/vscode-json-schema-preview/commit/a7137026872cc349e63a1caebe38a52986909fe9))
* **e2e:** stop demo-quickfix racing Quick Open's file-search index ([b99cb79](https://github.com/samdidos/vscode-json-schema-preview/commit/b99cb79e2a581ea9a0f496d964d4418ee9622dff))
* **F21:** match quick fixes to diagnostics by instance path ([8bbf0be](https://github.com/samdidos/vscode-json-schema-preview/commit/8bbf0be8638b10797be513c440c435b3cf053235))
* **F22:** override an existing $schema when migrating drafts ([5ac2b0b](https://github.com/samdidos/vscode-json-schema-preview/commit/5ac2b0bc50b22f0a1d33b4291c0bc4095a39ee8a))

## [0.8.0](https://github.com/samdidos/vscode-json-schema-preview/compare/v0.7.0...v0.8.0) (2026-07-14)


### Features

* **docs:** make homepage star background faster and interactive ([8b8d020](https://github.com/samdidos/vscode-json-schema-preview/commit/8b8d0201c13bd8f91a7b56cf49e72e6a7e2fd9e5))


### Bug Fixes

* **deps:** pin fast-uri to 3.1.3 to close a High-severity Snyk finding ([08f4abf](https://github.com/samdidos/vscode-json-schema-preview/commit/08f4abf9bd09ba0233782e0f7f31e44d8e16e7f4))
* **F01-FR-02:** match $schema hostname exactly, not a substring ([e39da2d](https://github.com/samdidos/vscode-json-schema-preview/commit/e39da2d31463b64fd8213bfa77549801314a514e))
* **F01-FR-02:** require $schema to reference a meta-schema, not just exist ([def0908](https://github.com/samdidos/vscode-json-schema-preview/commit/def090874e61bf612a455560fcb495e7b9a46403))

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
