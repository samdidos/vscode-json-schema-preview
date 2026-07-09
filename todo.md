# TODO — reviewed ideas

Validated against the codebase on 2026-07-09. Notes below say what's actually
true today vs. what needs rethinking before implementing.

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
