# TODO — reviewed ideas

Validated against the codebase on 2026-07-09. Notes below say what's actually
true today vs. what needs rethinking before implementing.

## Effort ranking (quick wins first)

Ordered by implementation effort. **Note on this repo's workflow:** even a
one-line *code* change needs a spec requirement first (constitution Article
IV + the traceability gate), so "trivial code" isn't always "trivial task."
The column below flags whether a spec amendment is needed, since that's often
the real cost for small items. Pure docs/config/CI edits skip that step.

| # | Task | Effort | Spec change needed? | Notes |
|---|------|--------|---------------------|-------|
| 6 | Delete `.eslintrc.json` | **Trivial** (~1 min) | No | ✅ **DONE** — dead file removed; lint (flat config) + knip still clean. |
| 3 | TOML on homepage (`docs/index.md`) | **Trivial** (~15 min) | No | ✅ **DONE** — Validation/Binding/Inference cards now name TOML; `F11` tagged on the homepage. F18/F19/F20 doc tags intentionally **not** added (see note under #3 — they're unbuilt; the warning is correct). |
| 10·1 | Add traceability checks to CI | **Trivial** (~10 min) | No | ✅ **DONE** — `check:traceability` + `check:doc-traceability` now run in `ci.yml`'s build job. |
| 9·a | Set `Diagnostic.source` on validation diagnostics | **Small** (~30 min) | **No** (already specified!) | ✅ **DONE** — turned out F03-FR-08 *already* mandated `source: "JSON Schema"`; code just didn't comply. Fixed + test added. |
| 10·2 | Path-filter CI/CodeQL for docs-only PRs | **Small** (~1 hr) | No | Straightforward `paths-ignore`, but **verify branch-protection required-checks first** (may need a no-op companion workflow). |
| 4 | Compact status bar items | **Small** (~1-2 hr) | Yes (F04/F07) | ✅ **DONE** — binding label middle-truncates long names (new `statusBarFormat.ts`); auth item is now icon-only with host in tooltip. F04-FR-06/F07-FR-10 amended + tested. |
| 5 | Config to force the JS fallback renderer | **Medium** (~half day) | Yes (F01) | ✅ **DONE** — `jsonschema.preview.renderer: auto\|builtin` (F01-FR-27); `builtin` skips Python entirely. Pure `getPreviewRenderer()` tested; documented in the config guide. |
| 9·b | Draft-aware Ajv (2019/2020 dialects) | **Medium** (~half day) | Yes (F03) | ✅ **DONE** — new pure `ajvFactory.ts` picks Ajv2020/Ajv2019/draft-07 by `$schema`, wired into the validate command (F03-FR-15). `sampleDataGenerator` deliberately stays on the default dialect (strips `$schema`). Tested end-to-end (prefixItems now enforced). |
| — | S03-SR-13 + S08 test tails | **Medium** (~half day) | No (specs exist) | Additive E2E/timing assertions on existing harness; cheapest way to fully *close out* a spec. |
| 11 | Evaluate Snyk vs. Trivy | **Medium** (spike, ~1-2 days over 2 wks) | Likely (constitution note) if it *replaces* Trivy | 🟡 **STARTED** — weekly non-blocking `snyk.yml` added (schedule-only, no-ops until a `SNYK_TOKEN` secret is set). This is the side-by-side eval step; no constitution change yet since nothing is replaced. Add the token to actually run it. |
| 19 | F19 — TOML IntelliSense | **Large** (~2-3 days) | No (spec exists) | Two new language providers; smallest of the three unbuilt features. |
| 18 | F18 — Code generation | **Large** (~3-4 days) | No (spec done) | ✅ **DONE** — `jsonschema.generateTypes`: pure `typeGenerator.ts` (quicktype-core, pinned exact) fed by F14's `bundleSchema`; bind-success notification now offers Generate Sample/Types. One spec refinement while implementing: pre-**bundle**, not pre-dereference — full inlining duplicates shared `$defs` into separately-named types (verified empirically), bundling keeps them as single named declarations. All 12 F18 reqs implemented + tagged; snapshots compiled under `tsc --strict` in tests. |
| 20 | F20 — Workspace validation | **Large** (~3-4 days) | No (spec exists) | Biggest surface area: discovery + aggregation + progress UI + diagnostics. |
| 1 | Modernize website look | **Large + open-ended** | No | ✅ **DONE** — polished VitePress: gradient hero + glow, hover lift on cards/buttons, subtle scroll-reveal (section sliding), all gated on `prefers-reduced-motion`. Verified in a real Chromium build (light/dark/reduced-motion). |
| 2 | "Unclosed spec tags" | **None** (debunked) | — | Not a real bug; nothing to do. |
| 7 | Branch-cleanup command | **None** (reference) | — | Informational; nothing to delete right now. |

**Suggested first sprint of quick wins:** #6 → #3 → #10·1 → #9·a. All four
are low-risk, mostly docs/config/CI, and only #9·a touches product code (one
line). That knocks out the cruft, the doc gaps, and the CI enforcement hole
before touching any feature work. Details for each item below.

## 1. Modernize the website look
**Valid, but underspecified.** Site is stock VitePress (`docs/.vitepress/`)
with a light custom theme (`theme/style.css`, `theme/index.ts`,
`QuickDemo.vue`, `ReleaseBadge.vue`) and a sky-blue brand palette
(`--vp-c-brand-*`). Nothing structurally blocks a redesign. "Modern" is
subjective though — before implementing, pick concrete direction, e.g.:
- custom hero section (beyond default `layout: home` frontmatter)
- redesigned feature grid / animations on scroll
- custom font pairing (currently VitePress default)
- possibly a non-default landing layout instead of `layout: home`
Next step: decide direction (maybe sketch 2-3 reference sites) before coding.

## 2. Spec tags "not closing" (start/end mismatch)
**Checked — not currently true.** `npm run check:doc-traceability` passes
with **0 errors**; all `start`/`end` tag pairs across README.md and
`docs/**/*.md` are balanced (verified the stack-matching logic in
`scripts/check-doc-traceability.mjs` by hand against every tag in the repo,
including the nested `F07,F08` / `F08` pair in `docs/guide/authentication.md`
which is correctly balanced, not broken).
What *is* real (see #3): 3 features have **no tag at all** anywhere in docs
— that's a separate, only-a-warning issue, not an unclosed-tag bug. If you
saw something look "unclosed" visually, it was probably that nesting in
`authentication.md` — worth a comment there since it's non-obvious, but not
a bug.

## 3. Some specs missing from docs / no TOML mention on the website
**Partially valid — two distinct real gaps found:**
- `check:doc-traceability` **warns** (does not fail) that **F18
  (code-generation), F19 (toml-intellisense), F20 (workspace-validation)**
  have no `<!-- spec:Fxx -->` tag anywhere in README/docs. These look like
  newer specs that were never surfaced in user docs at all.
- **TOML is genuinely missing from the website homepage**
  (`docs/index.md`): every feature card (Live Preview, Instant Validation,
  Schema Binding, Schema Inference) says "JSON or YAML" / "JSON, JSONC,
  JSONL, and YAML" — TOML is never mentioned, even though F11 (TOML support)
  is implemented and *is* documented in the guide pages
  (`docs/guide/configuration.md`, `docs/guide/commands.md`) and in
  `README.md:29`. The doc-traceability checker doesn't catch this because it
  only checks "is F11 tagged *somewhere* in docs/", not "is it on the
  homepage" — so this is a real coverage gap the tooling can't see.
  Fix: update the relevant `docs/index.md` feature card text (and add
  `<!-- spec:F11 -->` there) to mention TOML.

**✅ Done (TOML part):** `docs/index.md`'s Instant Validation, Schema
Binding, and Schema Inference cards now name TOML, and F11 is tagged on the
homepage (`spec:F03,F11` / `spec:F04,F11` / `spec:F06,F11`).

**Deliberately NOT done (F18/F19/F20 doc tags):** those three are *planned,
unbuilt* features. Adding `<!-- spec:Fxx -->` tags for them would mean
writing user-facing docs for capabilities that don't exist yet — documenting
vaporware to silence a warning. The `check:doc-traceability` warning for
them is **correct** and should stay until each feature actually ships (at
which point its docs — and tag — get added as part of that feature's PR).
The warning is non-blocking by design precisely for this case.

## 4. Compact status bar items
**Valid, confirmed in code.**
- `SchemaAuthStatusBar.ts:39/43` — text is `` $(lock) ${host} `` /
  `` $(unlock) ${host} ``, so it grows with the schema host's domain length
  (e.g. `raw.githubusercontent.com`). Making it icon-only (with host moved
  into the tooltip, which already exists) is straightforward.
- `SchemaBindingManager.ts:110/117/120` — text is `` Schema: ${path.basename(...)} ``
  (or `unbound`), unbounded length for long schema filenames. Truncating
  with a max length (e.g. middle-ellipsis) + full path already in tooltip
  (already exists at lines 111-121) is a small, contained change.
Both are UI-only changes in existing files — low risk. Per this repo's
spec-driven workflow, will need a small addition to `specs/F04-binding.md`
and/or `specs/F07-auth.md` (or F09-configuration if made configurable)
before implementing, per `specs/README.md` workflow.

## 5. Config to disable json-schema-for-humans, forcing the in-house JS renderer
**Valid idea, doesn't exist yet.** There's already a pure-JS fallback
renderer (`src/fallbackRenderer.ts`, see F01-FR-21/22 in
`specs/F01-preview.md`), but today it's used **only automatically** when the
Python interpreter or `json_schema_for_humans` package is unavailable
(checked in `PreviewWebPanel.ts`). There is currently **no user-facing
setting** to force the JS fallback even when Python *is* available (e.g. for
users who don't want Python installed at all, or want faster/lighter
previews). This would be a genuinely new feature, not a bug fix:
- needs a new requirement in `specs/F01-preview.md` (or `specs/F09-configuration.md`,
  since it's a config knob) — e.g. `jsonschema.preview.renderer: "auto" |
  "python" | "builtin"` — then `package.json` contribution + a check in
  `PreviewWebPanel.ts` before attempting the Python path.
- straightforward to implement since the renderer already exists and is
  tested (`src/test/unit/fallbackRenderer.test.ts`); this is really "expose
  an existing capability via a setting," not building new rendering logic.

## 6. Root-level cruft / duplicate ESLint config
**Partially valid.** Checked every root-level file:
- **`.eslintrc.json` is dead and should be deleted.** `package.json` pins
  `eslint@^10.6.0`, and ESLint 9+ only reads flat config
  (`eslint.config.js`, which already exists and is the one actually used by
  `npm run lint` → `eslint`). `.eslintrc.json` is legacy eslintrc-format and
  is no longer loaded at all — safe to `git rm .eslintrc.json`.
- Everything else at root that might look redundant, isn't:
  - `.json-schema-tool` — not stale; it's deliberately excluded from the
    packaged `.vsix` via `.vscodeignore:30`, so it's kept at root
    intentionally (looks like directory/marketplace-listing metadata), not
    a leftover.
  - The four `tsconfig*.json` files (`tsconfig.json`, `.test.json`,
    `.e2e.json`, `.integration.json`) are each used by a distinct build/test
    target per `AGENTS.md` — not duplicates.
  - `npx knip` (dead-code/unused-file/dep detector already wired into this
    repo) reports **zero findings** right now, so there's no other
    unused-file cruft it can see.
- Fix: just remove `.eslintrc.json`.

## 7. Command to delete all local feature branches except the current one
**Valid ask, nothing to actually delete right now.** Checked `git branch -a`:
only `main` and the current branch
(`claude/website-modernize-spec-review-na33qs`) exist, locally or on
`origin` — so there's nothing to clean up yet. For future use, here's the
command (local branches only; uses `-d` so it refuses to delete anything
unmerged, as a safety net):

```sh
git branch | grep -v '^\*' | grep -vx '  main' | xargs -r -n1 git branch -d
```

Deleting the matching **remote** branches too (more destructive — affects
what teammates see) would be a separate, explicit step per branch:

```sh
git push origin --delete <branch-name>
```

Not run automatically — branch deletion is a destructive, hard-to-reverse
op per this session's safety rules, so it should be confirmed (and reviewed
for unmerged work) before running, even though `-d` already blocks
unmerged branches.

## 8. Remaining planned specs — pick what's next
Pulled straight from `specs/traceability.json` (`status: "planned"` = spec'd
but not built yet): **36 requirements total**, in 5 files. Three are whole
unbuilt features (11/9/11 requirements each — biggest lift); two are small
tails on specs that are otherwise already implemented.

### Whole new features (not started)
- **F18 — Code Generation (Schema → Types)**
  (`specs/F18-code-generation.md`, 11 planned reqs: 9 FR + 2 NFR)
  Adds a `jsonschema.generateTypes` command: turns a bound schema into
  TypeScript `interface`/`type` declarations in a new untitled editor
  (enums → unions, `$ref` resolved with F13 semantics, `title`/`description`
  → TSDoc, deterministic output). Fully in-process, no subprocess/network.
  Biggest of the three — new command, new codegen module, new tests.
  **Library choice (revisited):** first pass here recommended hand-rolling
  the generator, since the obvious library (`json-schema-to-typescript`)
  ships its own `$ref` resolver that conflicts with F18-FR-06's requirement
  to resolve refs with F13 semantics. Revisiting after discussion —
  **`quicktype-core`** (the library behind the `quicktype` CLI: TypeScript,
  Python, Go, Rust, Java, C#, Swift, Kotlin, Dart, C++, and more from one
  schema) is usable in-process as a library, not just a CLI, which changes
  the calculus if multi-language output beyond TypeScript is wanted later —
  hand-rolling every target language yourself would be a large undertaking
  quicktype has already solved. The `$ref`-resolver conflict is avoidable
  without fighting quicktype's internals: **F14 (`dereferenceSchema` in
  `src/schemaBundler.ts`) already produces a fully self-contained schema
  with every `$ref` inlined, using the exact same F13 resolver
  (`schemaPointer.ts`).** Pre-dereference with that existing function before
  handing the schema to quicktype-core, and quicktype never needs to
  resolve a `$ref` itself — satisfying F18-FR-06 by construction and
  F18-NFR-01 (no network at generation time, since any remote fetch already
  happened through F14's own auth/cache-aware resolution). Net effect:
  reuse this repo's own ref/auth/cache machinery for resolution, and let
  quicktype-core own only the keyword→target-language-type mapping —
  gets multi-language support close to free if that's ever wanted, at the
  cost of one added dependency.

  **Decision: go with `quicktype-core`**, pre-dereferenced through F14's
  `dereferenceSchema` as described above. In plain terms, here's what
  currently *doesn't* line up with the spec as written, and needs a spec
  amendment before implementing (none of these are hard blockers — they're
  paperwork, except the last one, which is a real trade-off):
  - **"No network while generating types"** — quicktype can reach out to the
    internet on its own to resolve schema links. Fix: resolve every link
    ourselves first (via F14), so quicktype has nothing left to look up.
  - **"Schema links resolve the same way everywhere in this extension"** —
    quicktype has its own private logic for following `$ref` links, separate
    from the one this extension already uses everywhere else (hover,
    bundling, etc.). We bypass quicktype's version entirely rather than run
    two different resolvers side by side.
  - **"The generator is a plain function: schema in, text out"** — quicktype's
    version of that function is async (returns a promise) instead of a plain
    string. Just a one-line wording fix in the spec, not a real problem.
  - **Dependency size (the real trade-off).** The project keeps a short,
    deliberate list of dependencies (5 today, each small and single-purpose)
    with a one-line justification for each. Quicktype is a much bigger
    library (~14 of its own dependencies) than anything on that list — it
    needs its own justified entry, and it's a genuine step up in size versus
    everything else this project depends on.
  **Done:** `specs/F18-code-generation.md` has been amended — Q1 resolved in
  favor of `quicktype-core`, F18-FR-06 now requires pre-dereferencing via
  F14, F18-NFR-01/02 reworded for the async/pre-dereferenced pipeline, and a
  new **F18-NFR-03** added (pin `quicktype-core` to an exact version for
  determinism). Article II in `.specify/memory/constitution.md` now has a
  row for the dependency, and `specs/traceability.json` has the new
  `F18-NFR-03` entry (`planned`). `npm run check:traceability` and
  `check:doc-traceability` both still pass.

  **✅ Implemented (2026-07-10):** see the effort table (#18) — command,
  generator, tests, and docs all landed. Note the pipeline uses F14's
  `bundleSchema` rather than `dereferenceSchema` (spec amended accordingly):
  quicktype does not structurally unify inlined duplicate copies, so full
  dereferencing would have produced `HomeClass`/`WorkClass`-style duplicate
  declarations instead of one named type per `$defs` entry.

- **F19 — TOML Schema IntelliSense**
  (`specs/F19-toml-intellisense.md`, 9 planned reqs: 7 FR + 2 NFR)
  Closes the gap left by F11 (TOML validates, but has no schema-aware
  editing help): a completion provider (keys, `enum`/`const` values) and a
  hover provider for inline-`$schema`-bound `.toml` files, reusing the
  existing schema resolution/cache pipeline and F13's `$ref` semantics.
  Medium lift — two new VS Code language-feature providers.

- **F20 — Workspace Validation Report**
  (`specs/F20-workspace-validation.md`, 11 planned reqs: 8 FR + 3 NFR)
  A `jsonschema.validateWorkspace` command: finds every bound data file
  workspace-wide, validates each (reusing F03), lints every schema (F17
  rules), publishes workspace diagnostics + a copyable Markdown summary,
  with cancellable progress and S02 workspace-trust handling. The "is my
  repo green?" button. Largest surface area (discovery + aggregation +
  progress UI + diagnostics), likely the biggest lift of the three.

### Small tails on already-implemented specs
- **S03-SR-13** (`specs/S03-performance.md`) — one soft NFR: preview
  generation should complete within 2s p95 for typical schemas. Per its own
  note ("measure via E2E timing before promoting"), this just needs an E2E
  timing assertion, not new product code — cheap, and a natural pairing
  with the next item.
- **S08 — E2E testing gaps** (`specs/S08-e2e-testing.md`), 4 planned reqs:
  `SR-06` (one smoke test per user-facing command), `SR-07` (assert
  S03-SR-13's p95 budget in E2E — same work as above), `NFR-01` (job should
  finish under 10 min), `NFR-02` (E2E suite must not hit the network). The
  E2E harness itself already exists and runs in CI
  (per `AGENTS.md`'s "Integration tests" section) — this is filling
  remaining coverage/perf assertions in it, not standing up new
  infrastructure. Cheapest way to close out fully-planned status on a spec.

**For a decision:** S03-SR-13 + S08 together are the cheapest way to fully
close out specs (small, additive, no new UI). Of the three new features,
F19 (TOML IntelliSense) has the smallest surface area; F18 and F20 are
comparably sized and both add a new top-level command.

## 9. Validation bug report — anyOf (array | object) shows the wrong branch's error
Investigated the "I entered an object but got an error saying it should be
an array" report. Two separate, confirmed findings:

- **Likely root cause: two different validators are in play, and it's
  probably not this extension's own.** This extension writes bindings into
  VS Code's standard `json.schemas` / `yaml.schemas` settings
  (`SchemaBindingManager.ts`), which means **VS Code's own built-in
  JSON/YAML language server** (not this extension) live-validates as you
  type — completely separate from this extension's on-demand
  `jsonschema.validateFile` command (`ValidationManager.ts`), which only
  populates its own Problems-panel collection when explicitly run. If the
  wrong-branch error appeared as a live squiggle rather than after running
  "Validate" explicitly, it's VS Code's built-in validator, which has a
  known, long-standing imprecision with `anyOf`/`oneOf`: when a value fails
  every branch, it doesn't pick the "closest" branch — it can surface an
  unrelated branch's error (e.g. reporting "should be array" for an object
  that was meant to match the object branch but fails there too, for an
  unrelated reason like a missing `required` field). That behavior lives
  outside this repo (in `vscode-json-languageservice` / the YAML
  extension), so it isn't directly fixable here.
  - **Cheap, worthwhile fix regardless:** `ValidationManager.ts` never sets
    `Diagnostic.source` on the diagnostics it creates, so even this
    extension's own on-demand validation is indistinguishable from VS
    Code's built-in one in the Problems panel today. Setting e.g.
    `diag.source = 'json-schema-preview'` is a one-line change that would
    let you (and any user) immediately tell which validator produced a
    given error — useful for exactly this kind of report going forward.

- **Confirmed, separate gap: this extension's own Ajv instance ignores the
  schema's declared draft.** `ValidationManager.ts:16` always does
  `require('ajv').default` — the plain `Ajv` class (draft-07 dialect) —
  regardless of the schema's `$schema` value. It never switches to
  `Ajv2019`/`Ajv2020` for schemas declaring the 2019-09 or 2020-12 meta-
  schema URIs. With `strict: false` (`ValidationManager.ts:96`), any
  keyword Ajv's core doesn't recognize — 2020-12's `prefixItems`,
  `$dynamicRef`/`$dynamicAnchor`, 2019-09/2020-12's
  `unevaluatedProperties`/`unevaluatedItems` — is silently ignored rather
  than raising an error, so a schema written against a newer draft can
  validate incorrectly with no warning that anything was skipped. This
  answers the original question directly: **no, schema-version-aware
  validation is not implemented** — one Ajv dialect is used for every
  draft. Fix: pick `Ajv` vs `Ajv2019` vs `Ajv2020` (from `ajv/dist/2019`
  `/2020`) based on the schema's `$schema`, falling back to draft-07 when
  absent, in both `ValidationManager.ts` and `sampleDataGenerator.ts`
  (same pattern, same plain-`Ajv` call at `sampleDataGenerator.ts:224`).
  This would need a new requirement in `specs/F03-validation.md` before
  implementing.

**Next step to pin down your specific case:** if you can share the actual
`anyOf` snippet (or which file — was it a live squiggle or the output of
running "Validate" explicitly?), I can tell you definitively which of the
two explanations applies.

## 10. Skip GH Actions workflows based on what a PR touches
**Valid — confirmed none of the 9 workflows use path filtering at all**
(`grep -n "paths-ignore\|^\s*paths:" .github/workflows/*.yml` — zero hits).
Today, a docs/spec-only PR (like this one) still runs `ci.yml`'s full
`build` job (lint, `tsc`, webpack compile, full coverage suite,
`maturity:check`, `npm audit`), its `security`/Trivy job, `knip`, and the
two-OS `integration` job (each downloads a real VS Code build) — plus all of
`codeql.yml`. None of those touch anything a doc/spec-only change could
have broken.

**More interesting finding while checking this: CI is currently checking the
wrong things for exactly this scenario.** `ci.yml`'s `build` job runs lint,
`tsc`, `compile`, and `test:coverage` directly — it does **not** call
`check:traceability` or `check:doc-traceability` anywhere. Those two checks
only run locally, via the Husky pre-commit hook and the Claude Code
PreToolUse hook (both call `npm run verify`, which is the only place that
chains them in). So today: a docs/spec-only PR pays for a full CodeQL scan,
full coverage run, and two VS Code downloads that can't catch anything —
while the one check that actually matters for a specs/traceability.json
change (drift detection) **never runs in CI at all**, only on whoever's
machine happens to commit through the hook (bypassable with
`git commit --no-verify`). That's a real gap independent of path filtering.

**Suggested fix, two parts:**
1. Add `check:traceability` and `check:doc-traceability` as explicit steps
   in `ci.yml`'s `build` job (or just run `npm run verify` there instead of
   re-listing lint/tsc/coverage separately) — this closes the enforcement
   gap regardless of anything else, and per this repo's own stated principle
   (`AGENTS.md`: "guarantees live *below* the agent," CI is the real
   guarantee, hooks are only a convenience) this arguably should already be
   true.
2. Once that's in place, it's safe to add `paths-ignore` (or `paths`) to
   `ci.yml` and `codeql.yml` so the expensive src-oriented jobs (lint, tsc,
   compile, coverage, CodeQL, Trivy, knip, integration) only run when
   something that could actually break shows up in the diff — `src/**`,
   `package*.json`, `webpack.config.js`, `tsconfig*.json`, or the workflow
   files themselves. Doing this *before* part 1 would be a mistake: a blanket
   `paths-ignore: [specs/**, docs/**, *.md]` would also silence the
   traceability checks for exactly the PRs most likely to touch
   `specs/traceability.json` — the opposite of what's wanted.

**One caveat to check before implementing, not yet verified:** if `CI` or
`CodeQL` are configured as *required* status checks in this repo's branch
protection rules, a workflow that never triggers (because its `paths` filter
didn't match) shows up as permanently "Expected — Waiting" and blocks
merging — GitHub's known gotcha with path-filtered required checks. Needs a
companion no-op workflow (triggered on the inverse path set, immediately
reporting success under the same check name) if that's the case here —
worth confirming the branch protection config first.

## 11. Evaluate Snyk (instead of, or in addition to, Aqua Trivy)
**Idea to evaluate — real trade-offs both ways.** Current state: the
`security` job in `ci.yml:41-52` runs `aquasecurity/trivy-action` (v0.36.0,
SHA-pinned) as a filesystem scan for `CRITICAL,HIGH` with `exit-code: 1`
(blocking). Note the repo *already* has three overlapping security layers:
this Trivy fs scan, `npm audit --audit-level=high` (`ci.yml:39`, also
dependency-vuln), and CodeQL (`codeql.yml`, SAST) — plus OpenSSF Scorecard.

What Snyk would bring:
- **Snyk Open Source (SCA)** — dependency-vuln scanning; overlaps directly
  with *both* the Trivy fs scan and `npm audit`. Snyk's curated advisory DB
  is sometimes ahead of public feeds and gives actionable fix/upgrade paths
  (and auto fix-PRs), which `npm audit`/Trivy don't.
- **Snyk Code (SAST)** — overlaps with CodeQL.
- **License compliance + IaC scanning** — genuinely *new* capability not
  covered by any current tool.

Two honest downsides to weigh before adopting:
1. **Redundancy / noise.** "In addition to" means a *fourth* dependency-vuln
   scanner on top of Trivy + `npm audit` + Scorecard — likely duplicate
   alerts for the same CVEs. If adopting, the cleaner framing is "Snyk
   *instead of* Trivy (and maybe `npm audit`)", picking one SCA tool rather
   than stacking a fourth. Decide what it replaces, not just what it adds.
2. **Vendor/agnosticity tension (the big one for this repo).** Snyk is a
   commercial, closed product needing an account + a `SNYK_TOKEN` secret in
   CI. That runs against this project's stated principle (`AGENTS.md`
   "Agnosticity & standardization" #5: *prefer open, portable, independently
   verifiable tooling* — SHA-pinned actions, OpenSSF Scorecard, SLSA). Trivy
   is Apache-2.0 open source with no account/token. Swapping an open tool
   *out* for a proprietary one is the opposite direction from the
   constitution — not disqualifying, but it deserves an explicit, documented
   justification (and probably an Article II / constitution note) the same
   way the `quicktype-core` decision did (#8). Snyk's free tier is also
   limited-per-month, which can bite an open-source repo's CI volume.

**Suggested next step:** rather than replace outright, do a time-boxed
side-by-side — run Snyk in a *non-blocking* CI job for a couple of weeks
next to Trivy, compare signal quality / false-positive rate / fix guidance
on this repo's actual dependency tree, then decide whether it earns
replacing Trivy (+ maybe `npm audit`) or isn't worth the vendor lock-in.
