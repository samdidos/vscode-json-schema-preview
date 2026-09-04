# S08 — End-to-End Testing

## Overview

The unit suite runs against a **mocked** `vscode` module. The mock's
`getConfiguration().inspect()` returns the *same value for every settings
layer* and ignores resource scoping entirely, so an entire class of real bug —
wrong `ConfigurationTarget`, folder-scoped settings in multi-root workspaces,
path-prefix mismatches between what a binding writes and what a reader
matches — passes the unit suite by construction. The multi-root binding bugs
found in mid-2026 (F04-FR-13 and the `findBoundSchemaPath` scope/prefix
mismatches) are exactly this class. The Playwright scripts under
`src/test/e2e/` do not cover it either: they are demo-GIF *recordings*
(screenshots, no assertions) that only run in the GIF-refresh workflow.

This spec adds a real end-to-end suite that runs the packaged extension in an
actual VS Code instance (`@vscode/test-electron`), against real settings
files, real multi-root workspaces, and the real filesystem — the layer where
the mock necessarily lies.

## Requirements

### Harness

- **S08-SR-01** An E2E suite MUST run the extension in a downloaded, real
  VS Code build via `@vscode/test-electron` (`npm run test:integration`),
  driving it through the `vscode` API from an extension-host test runner (no
  UI scripting required). It MUST be runnable headless in CI (xvfb).
- **S08-SR-02** Fixtures MUST include at least: a single-folder workspace, a
  **multi-root** workspace (≥ 2 folders with distinct `.vscode/settings.json`
  files), and data/schema files in JSON, YAML, and TOML.
- **S08-SR-03** E2E tests MUST use the same mocha `tdd` interface and
  requirement-tag convention as unit tests; a `[ID]` tag in an E2E test title
  MUST count as test coverage in `npm run check:traceability`, so `manual`
  requirements verified by an E2E test can be promoted to `implemented`.

### Mandatory Scenarios

- **S08-SR-04** Settings-scope round-trips MUST be covered as a matrix: for
  each of Global / Workspace / WorkspaceFolder × JSON / YAML, bind a schema,
  then assert (a) the entry landed in the *correct* settings file with the
  *correct* path form, and (b) the extension's own readers
  (`findBoundSchemaPath` → status bar, validator) see the binding — in both
  single-folder and multi-root fixtures, including the cross-folder case
  (schema in folder A, data file in folder B).
- **S08-SR-05** Inline-binding round-trips MUST be covered for JSON, YAML,
  and TOML: bind, assert the document text, validate, remove, assert clean —
  including a TOML file whose first content is a `[table]` header and a
  schema path containing characters that require escaping in the target
  syntax.
- **S08-SR-06** One smoke test per user-facing command in
  `package.json#contributes.commands` MUST at minimum execute the command
  against a fixture and assert it neither throws nor leaves an error
  notification.
- **S08-SR-07** The S03 startup/perf budgets (e.g. S03-SR-13's p95 command
  latency) MUST be measured in the E2E run and reported, so `planned`
  performance requirements can be promoted with real numbers.

### CI Integration

- **S08-SR-08** The E2E suite MUST run in CI on every PR (own job, may be
  slower than unit tests). It MAY start non-blocking while flakiness is
  measured, but MUST be promoted to a required check once it has run clean
  for 2 consecutive weeks; the promotion MUST be recorded in this spec's
  History.

  **Non-blocking MUST mean "not a required status check", never
  `continue-on-error: true`.** The two are not interchangeable: branch
  protection decides whether a red job blocks the merge button, while
  `continue-on-error` makes the job *report green when it failed*. The second
  does not just hide the failure — it destroys the evidence this requirement
  depends on, because a job that always reports success can never be observed
  running "clean for 2 consecutive weeks", so the promotion criterion can
  never be evaluated and the job stays provisional forever.
- **S08-SR-09** The suite MUST run on both Linux and **Windows** runners —
  path-separator and drive-letter handling (absolute paths embedded by
  F04-FR-13/F10-FR-05, TOML string escaping) are platform bugs the unit
  suite cannot catch on Linux alone.

### UI smoke (Playwright demo scripts)

The `src/test/e2e/` Playwright scripts capture screenshot frames for the demo
GIFs and contain no assertions, so historically they ran only in the
GIF-refresh workflow. They come in two variants per feature: a **mouse** twin
(`demo-<x>-mouse`, animated cursor — the frames the GIF pipeline consumes) and a
**command-palette** twin (`demo-<x>`, no mouse — whose frames the GIF pipeline
does **not** consume). The command-palette twins are otherwise wasted effort,
yet they exercise the real feature flow through the actual VS Code UI, so they
have value as a lightweight UI **smoke** signal the assertion-based integration
suite (API-level) does not provide.

`demo-showcase-mouse` is the one exception to "capture screenshot frames": it
records the real X11 display instead (see the 2026-07 History note) and feeds
`scripts/make-showcase-gif.mjs`, not `scripts/make-gifs.mjs`. It still follows
the mouse/non-mouse split below — `mouse` in the title is what routes it to
the GIF-refresh job rather than the smoke job, regardless of capture
mechanism.

- **S08-SR-10** The command-palette (non-mouse) demo scripts MUST run as a
  UI-smoke job (Playwright launching real VS Code, headless via xvfb), passing
  when each demo flow completes without throwing or timing out — i.e. crash /
  broken-selector detection, not pixel assertions. It runs at **release time**
  (the GIF-refresh workflow, `on: workflow_run` after Release Please), not on
  every PR/push — see the History note on why — as a job parallel to (not
  dependent on) the GIF-refresh job, so neither lengthens the other's critical
  path. It MUST start **non-blocking** while flakiness is measured, in the
  same sense S08-SR-08 defines: excluded from the required status checks, and
  never via `continue-on-error: true`. It runs after a release rather than on
  a pull request, so nothing about it can block a merge in the first place —
  swallowing its result would buy nothing and cost the only signal it exists
  to produce.
- **S08-SR-11** The mouse demo scripts MUST NOT run in the smoke job, and the
  GIF-refresh workflow's `refresh-gifs` job MUST run **only** the mouse scripts
  (the non-mouse frames it never consumes) — so each Playwright variant runs in
  exactly one place: mouse → GIFs, non-mouse → smoke. The split is by
  test-title grep on `mouse`, which every mouse test title contains and no
  non-mouse title does.

### Release-Scoped Demo Selection

- **S08-SR-12** At release time, the GIF-refresh workflow's `refresh-gifs` job
  and the UI-smoke job (`e2e-smoke`) MUST determine which specs changed or
  were newly added since the previous release tag, and MUST run demo
  Playwright scripts (both the mouse and command-palette twins) and
  regenerate GIFs **only** for the demos mapped to those specs, instead of the
  full set on every release. When no previous release tag is resolvable (the
  first release, or a checkout too shallow to reach one) the run MUST default
  to every demo, mirroring S09-SR-02's "no usable base → run everything"
  fallback.
- **S08-SR-13** The demo ↔ spec mapping MUST be declared in exactly one place
  (`scripts/demo-registry.mjs`), consumed by both the GIF generator
  (`scripts/make-gifs.mjs`) and the change-detection script
  (`scripts/detect-changed-features.mjs`) — adding a demo for a new feature,
  or reassigning one to a different spec, is a one-file edit. `demo-showcase`/
  `demo-showcase-mouse` is mapped like any other entry, to every spec its
  narrative touches (F01, F02, F03, F04, F06, F09, F10, F18 per the History
  notes above), even though its GIF is produced by a different script
  (`scripts/make-showcase-gif.mjs`) than the other demos.
- **S08-SR-14** This selection applies only to the demo/GIF pipeline
  (`refresh-gifs.yml`'s two jobs). The assertion-based integration suite
  (`npm run test:integration`, S08-SR-08) is unaffected and continues to run
  in full on every PR — it is not release-scoped and not keyed to which specs
  changed, since it is regression coverage for the whole extension, not a
  per-feature demo capture.
- **S08-SR-15** The `refresh-gifs.yml` `workflow_dispatch` trigger MUST accept
  an optional `demos` input — a comma-separated list of demo names (as they
  appear in `scripts/demo-registry.mjs`), or the literal `all` — that
  overrides S08-SR-12's automatic spec-diff selection for that run only. This
  covers the case S08-SR-12 cannot: a change to a demo's *script* (the
  Playwright test itself, or a doc/History note) rather than to one of its
  mapped spec files, which produces no spec-diff signal for
  `detect-changed-features.mjs` to key off, yet still needs the GIF/smoke run
  it would otherwise only get by coincidentally touching a mapped spec too.
  An unrecognised demo name in the override MUST fail the run rather than
  silently produce an empty or partial selection. Leaving the input empty
  (the default) MUST fall through to S08-SR-12's normal behaviour unchanged.

### GIF Encoding

- **S08-SR-16** Every demo GIF — the frame-stitched ones and the showcase
  recording alike — MUST be encoded with **ffmpeg's two-pass palette
  pipeline** (`palettegen=stats_mode=diff` then
  `paletteuse=…:diff_mode=rectangle`). One encoder for all of them: a
  per-frame palette optimised for a mostly-static editor window, re-encoding
  only the region that changed between frames.
- **S08-SR-17** The GIF pipeline MUST NOT depend on a package requiring a
  native build. `canvas` compiles against cairo/pango at install time, which
  is why a plain `npm ci` fails in a minimal container and why the repository
  needs a bootstrap script at all — a cost paid on every clone by everyone, to
  serve a step that runs only at release time on one Linux runner that already
  has ffmpeg installed.
- **S08-SR-18** Encoding MUST preserve the captured frames' own resolution.
  Downscaling to save bytes is unnecessary: at identical dimensions the
  palette pipeline is roughly ten times smaller than the octree quantiser it
  replaces, so there is nothing to trade legibility for.

### Demo content and placement

- **S08-SR-19** Every demo MUST show its feature *succeeding*. A capture that
  ends on a refusal or a no-op is a defect in the demo script, not a
  documentation gap: the script MUST seed whatever state the feature needs (a
  bound schema, a fixture data file) before performing the action it
  demonstrates. `demo-validation` shipped for months ending on "No schema
  bound to person-invalid.json. Bind one first." — it opened an unbound file,
  so the one demo of the extension's headline feature never validated
  anything.

  Succeeding is not enough on its own: the **surface the step is about MUST be
  on screen while it changes**. A step whose subject is the rendered preview
  refreshing has to have the preview visible in the captured region — the
  command running correctly off-screen demonstrates nothing to a reader.
  `demo-showcase` shipped this way too: it closed the schema tab for "a beat
  with only the viewer on screen", which made VS Code drop the now-empty
  editor group and reopen the schema *inside the preview's group*, hiding the
  preview behind it. The panel was visible for 7 of 92 seconds, and neither
  the live-title-update step (F02) nor the configure step (F09) — both of
  which exist purely to show the preview changing — had it on screen at all.
  Where a demo can assert this, it SHOULD: a capture that silently records the
  wrong thing is the failure mode this requirement exists to catch, and
  nothing else in the pipeline notices it.
- **S08-SR-20** Every entry in `scripts/demo-registry.mjs` MUST be embedded on
  the docs site in **both** places a reader looks: the landing page's demo
  gallery (`docs/.vitepress/theme/QuickDemo.vue`) and the guide section that
  documents the command it shows. A GIF regenerated at release time and never
  displayed is pure payload. The **README** is deliberately the exception: it
  embeds `demo-showcase.gif` alone, because the marketplace renders it and
  seventeen inline GIFs would make that page unusable.
- **S08-SR-21** A frame-stitched demo SHOULD stay under 30 seconds of
  playback. Past that a reader scrubs rather than watches, and the file grows
  without teaching more. The 16 frame-stitched demos currently run 6.8–16.9 s,
  so the budget is headroom rather than a diet; it exists to keep a demo from
  quietly growing past the point where anyone watches it to the end.
  `demo-showcase` is the deliberate exception at 92 s — it is the one
  end-to-end narrative — but it SHOULD be trimmed toward the budget when it is
  next re-recorded (shortening it means re-recording, which needs a real X11
  session; it cannot be done by re-encoding).

### Harness notes (implementation)

- The `toml` language id and the `yaml.schemas` configuration key are not
  provided by any bundled VS Code extension (they normally come from the
  marketplace extensions `tamasfe.even-better-toml` and `redhat.vscode-yaml`).
  A **contribution-only fixture extension**
  (`src/test/integration/fixtures/test-lang-support`) declares both and is
  loaded via `extensionDevelopmentPath` — which is honoured even under
  `--disable-extensions` — so `.toml` files get a real language id and
  folder/workspace/user-scoped `yaml.schemas` writes succeed, all without a
  marketplace `--install-extension` step (satisfying S08-NFR-02 and avoiding
  the Windows `.cmd` spawn pitfalls that step brings). Because
  `redhat.vscode-yaml` itself is absent, inline YAML binding writes the plain
  `$schema:` key form rather than the `# yaml-language-server:` directive
  (F10-FR-09).
- Fixture schemas use **draft-07** (`http://json-schema.org/draft-07/schema#`):
  the extension's validator uses Ajv's default export, which bundles draft-07
  and does not know the draft 2020-12 meta-schema. This is also why the
  validator must parse YAML-format schema files (F03-FR-14) — the `schema.yaml`
  fixture proved `loadSchema` was JSON-only, an inconsistency with the other
  schema consumers that S08 was built to surface.

## Non-Functional Requirements

- **S08-NFR-01** The E2E job SHOULD finish in under 10 minutes; scenario
  count is bounded by the matrix above, not by porting the unit suite.
- **S08-NFR-02** E2E tests MUST NOT hit the network: remote-schema scenarios
  use a local HTTP fixture server, keeping runs deterministic and offline
  (S04, S05).

## History (encoding)

- **2026-09-02** — The 16 frame-stitched demos moved from `gif-encoder-2`'s
  octree quantiser to the same ffmpeg palette pipeline
  `make-showcase-gif.mjs` already used, and `canvas`/`gif-encoder-2` were
  dropped (S08-SR-16/17/18).

  The earlier History note reasoned that the screenshot pipeline was "simpler
  and has no external-binary dependency beyond the already-required canvas".
  Both halves of that turned out backwards. ffmpeg is not an *additional*
  dependency — the refresh workflow already installs it for the showcase — and
  `canvas` is not free: it is a native build, the reason `npm ci` fails in a
  minimal container, and the reason `scripts/bootstrap.mjs` exists.

  The measured result on the largest demo, at unchanged dimensions:
  **4.03 MB → 0.39 MB**, visually indistinguishable. Across the 16
  frame-stitched GIFs the committed payload drops from ~28 MB to ~3.4 MB.
  Re-encoding needs neither X11 nor the original frames — decoding each
  committed GIF and re-encoding it produces the same timing — so the existing
  GIFs were re-encoded in place rather than waiting for the next release to
  regenerate them. `demo-showcase.gif` was left alone: it already came out of
  this pipeline, so a second lossy pass would buy ~4% for a generation of
  quality. It stays the outlier at 7.8 MB — a length problem, not an encoding
  one (S08-SR-19).

  What still needs a real recording session — and so is *not* addressed here —
  is trimming `demo-showcase` (S08-SR-21).

- **2026-09-03 (showcase composition)** — `demo-showcase` was recorded with the
  preview panel on screen for 7 of its 92 seconds. Closing the schema tab to
  get "a beat with only the viewer" removed the editor group holding it, and
  the reopened schema editor then landed inside the preview's own group as a
  new tab, hiding it for the remainder of the run. The two steps that exist to
  show the preview reacting — the live title edit and the render-template
  change — both played against a full-width editor.

  The schema tab is no longer closed: editor left, docs right, for the whole
  narrative, which is also what using the extension actually looks like. That
  removed the need to reopen the file at all, and with it the Explorer/Quick
  Open flakiness the `Ctrl+Shift+T` workaround existed to dodge.
  `expectPreviewVisible()` now asserts the panel at each of those moments, so
  a capture that records the wrong thing fails instead of shipping
  (S08-SR-19).

  The first re-record attempt failed before reaching any of that, on
  pre-existing code: step 3 aimed the cursor straight at the `.codicon-close`
  icon of the *background* `person-valid.json` tab. VS Code reveals that icon
  only on the active or hovered tab, and `glideToLocator` waits for visibility
  before moving the pointer — so it waited for the very thing only the move
  would produce. That had resolved by luck for a long time and stopped on VS
  Code 1.136.1. The demo now glides to the tab, clicks it (which reveals its
  close button), and falls back to the keyboard shortcut. Worth recording
  because the class generalises: **a mouse demo must not target a control that
  only appears on hover**, since the wait that precedes the move cannot be
  satisfied by the move itself.

  The second attempt then failed on the new assertion itself, which is the
  guard behaving correctly about the wrong thing: it checked instantly, before
  the multi-second beat that follows each Preview click, and preview rendering
  shells out to a Python renderer. The instant check had been a deliberate
  choice — "the panel should already be up, so waiting would mask a slow
  reveal" — which is simply untrue at a site that has just *created* the panel.
  It now waits, bounded, and each call sits after its beat, so what it asserts
  is the state the recording actually contains.

  The third attempt reached 2.2 of the run's ~4 minutes — past all three
  preview assertions, so the layout fix itself held — and died at step 12,
  waiting for "Generate Types from This Schema" in the More Actions menu. That
  command had moved: `editor/title` now contributes the
  `jsonschema.schemaMenu` **submenu**, and every non-icon command sits one
  level down inside it. The restructuring landed earlier on the same branch,
  and nothing caught it, because the two attempts above both died at step 3 —
  this was the first full pass over the current `package.json` since. The
  general rule: **restructuring a menu contribution invalidates every demo
  that clicks through that menu**, and a demo only proves that when it runs
  end to end. A demo failing early hides every later step's breakage, so a
  fix that gets a demo further is not evidence that the rest still works.

- **2026-09-02 (coverage audit)** — Of 34 feature specs, 16 had no demo at all.
  Ranked by the S16 value estimate, the gaps were: F34 (18), F12 (15.36), F31
  and F33 (11.52), F08 (10.56), F27 and F29 (7.68), F15 and F30 (7.04), F11,
  F19 and F25 (5.28), F24 (4.8), F26 (3.52), F32 (2.4), F23 (1.35).

  `outline` (F31) and `schema-tests` (F29) were added in that pass — the two
  with the highest value among the interactions that reuse an existing demo
  pattern outright. The rest remain a backlog, in that order. F12's demo needs
  a local catalog fixture rather than SchemaStore (S08-NFR-02 forbids network
  access), and F32's needs a language model, so neither is a straight copy of
  an existing pattern.

  New demo scripts cannot be run in a container without an X server and a VS
  Code download, so the two added here are unverified until the next
  `refresh-gifs` run. That is deliberately survivable: the smoke job is
  non-blocking, `make-gifs.mjs` skips a demo whose frames are missing, and the
  docs gallery renders a placeholder for a GIF that does not exist yet — a
  broken new demo costs a missing image, not a red build.

## Out of Scope

- UI **pixel/screenshot** assertions. The mouse demo scripts remain a
  screenshot-only pipeline; the non-mouse twins are promoted to a *crash-level*
  smoke signal only (S08-SR-10), not visual assertions.
- Marketplace-install/packaging tests beyond loading the compiled extension.
- Replacing unit tests — pure-logic coverage stays in the mocked suite.

## Acceptance Criteria

1. `npm run test:integration` downloads VS Code, opens the multi-root
   fixture, and passes locally and in CI on Linux + Windows.
2. A deliberately reintroduced scope bug (e.g. dropping the resource argument
   from `findBoundSchemaPath`'s `getConfiguration`) fails at least one
   S08-SR-04 test.
3. `npm run check:traceability` counts `[ID]` tags found in E2E test titles.
4. CI shows the E2E integration job (S08-SR-08) on PRs; its History note
   records when it became a required check. The UI-smoke job (S08-SR-10) shows
   on the "Refresh Demo GIFs" workflow run instead, per the History note below.
5. A release whose diff since the previous tag touches only `specs/F06-*.md`
   runs (and its GIF regenerates for) only `demo-inference`/
   `demo-inference-mouse` and `demo-showcase`/`demo-showcase-mouse` (F06 is
   one of showcase's constituent specs) — every other demo is skipped in both
   `refresh-gifs` and `e2e-smoke`. A release with no resolvable previous tag
   runs every demo, unchanged from prior behavior.

## Relation to Existing Specs

- Verifies **F04/F10/F11** binding behaviour at the real-API layer; measures
  **S03** budgets; complements Article V unit coverage — `manual`-status
  requirements throughout the matrix become promotable once an E2E test tags
  them.

## History

- **2026-08** — Rewrote `demo-showcase`/`demo-showcase-mouse`'s narrative from
  five steps to thirteen, widening its constituent specs from F01/F02/F06 to
  F01/F02/F03/F04/F06/F09/F10/F18 (S08-SR-13). New narrative: open a good JSON
  data file, generate a schema from it and save it (F06); hide the raw JSON
  tabs so only the rendered schema viewer shows (F01); reopen the schema and
  live-edit its title, watching the viewer refresh (F02); configure the
  viewer (via `jsonschema.config`, F09) to show Expand all/Collapse all, and
  use both buttons; close every tab and open a bad JSON example; validate it
  (a "no schema bound" warning, F03) and inline-bind it to the generated
  schema straight from the warning's own action (F04/F10); validate again to
  show the binding doing real work; trigger IntelliSense and Ctrl+click the
  inline `$schema` value to open the schema file (both built-in VS Code JSON
  language features — this extension contributes no document-link/completion
  provider of its own for a *data* file's `$schema` field, so nothing in this
  repo's own code is exercised by those two beats); generate TypeScript types
  from the schema (F18); and finish by flipping `jsonschema.preview.autoOpen`
  in the Settings UI and reopening the schema file to show the preview open
  on its own with no click.
  The Expand all/Collapse all buttons required switching away from the
  default "flat" `json-schema-for-humans` template (chosen specifically to
  avoid a CDN fetch — see F01's History) to `js`, which loads jQuery/
  Bootstrap from a CDN. This was verified directly before writing the demo,
  not assumed: `js`'s template also references two local sibling files
  (`schema_doc.css`/`schema_doc.min.js`) that `PreviewWebPanel.ts` never
  serves (it reads only the single generated HTML file into a string,
  discarding any sibling assets JSON-schema-for-humans writes alongside it),
  but a headless-Chromium check against the tool's actual generated output
  confirmed their absence only costs a cosmetic style pass and one harmless
  `anchorOnLoad` console error — the buttons themselves are driven by
  Bootstrap's `data-toggle="collapse"`, wired up once jQuery/Bootstrap load
  from the CDN, and that still works. `js_offline` (the same template with
  every asset bundled locally, no CDN) was considered first and is the
  better long-term fit for this project's zero-network posture, but its
  local relative asset paths (`css/…`, `js/…`) have no working code path in
  `PreviewWebPanel.ts` at all — there is no `<base>`/`asWebviewUri` rewriting
  and no mechanism to keep a per-panel asset directory alive for the
  webview's lifetime, so unlike `js`'s CDN links (which at least resolve),
  `js_offline`'s local links would 404 unconditionally. Properly supporting
  `js_offline` would need webview-resource-serving work in `PreviewWebPanel.ts`
  itself — real product scope, not a demo-script change — so this rewrite
  deliberately took the already-working `js` template instead and left that
  as a candidate future spec rather than building it under this task.
  `demo-showcase` (command-palette twin) was extended to match — Configure
  Preview, Validate, inline Bind, and Generate Types all now run there too,
  as command-palette smoke coverage (S08-SR-10) — but continues to skip the
  IntelliSense/Ctrl+click beats (no command of this extension's own is
  behind them) and binds/generates against the pre-existing, hand-curated
  `person.schema.json` rather than the just-generated file, unchanged from
  its original simpler-on-purpose design (see the entry below).
- **2026-07-25** — Added S08-SR-12..14: the GIF-refresh workflow now runs
  demo Playwright scripts and regenerates GIFs only for the demos mapped to
  specs that changed or were added since the previous release tag, instead of
  the full 17-demo set every release. Scoped deliberately to the demo/GIF
  pipeline only — `test:integration` (S08-SR-08) is whole-extension
  regression coverage, not tied to a release's feature diff, and stays
  unscoped.
- **2026-07** — Added `demo-showcase`/`demo-showcase-mouse`, a sixth-ish demo
  pair that chains several features into one continuous session instead of
  one GIF per feature — the only demo GIF referenced from README.md, the
  per-feature GIFs stay docs-site-only via `docs/.vitepress/theme/QuickDemo.vue`.
  `demo-showcase-mouse`'s content settled on: open a JSON data file from
  Explorer, generate a schema from it (F06), save that schema to a real path
  with no visible dialog (Electron's native save dialog is stubbed via
  `app.evaluate` — Preview shells a Python renderer that reads a real file
  from disk, so it can't render an unsaved buffer, but nothing in the flow
  should show a native picker), close the original data file, preview the
  generated schema (F01), click a field in the rendered HTML, then live-edit
  the schema and watch the preview refresh (F02). No new fixtures: it reuses
  `showcase/data/person-valid.json`, already used by the individual
  inference demo. An earlier version chained five features (inference,
  preview/live-update, binding, validation, code generation) reusing the
  hand-curated `person.schema.json` rather than the schema the demo itself
  generated; it was narrowed to this tighter, single-artifact flow once video
  capture (below) made the compromises in that version — a schema swapped
  mid-story, an untouched-then-discarded inferred tab — visible instead of
  hidden by fast-cut screenshot stitching.
  `demo-showcase` (command-palette twin) intentionally stays simpler: it
  previews the existing `person.schema.json` rather than reproducing the
  save-dialog-stub and webview-click steps, since its only job is
  crash-smoke-testing the underlying commands (S08-SR-10), not reproducing
  the showcase narrative frame for frame.
  `demo-showcase-mouse` initially reused the stitched-screenshot approach
  (`helpers/mouse.ts`'s animated DOM cursor + `scripts/make-gifs.mjs`) like
  every other mouse demo, but that read as visibly synthetic once combined
  into one long recording — the DOM cursor moves in discrete steps (a
  Playwright-dispatched mouse move never moves the real OS pointer, so it
  can't be shown in a screenshot at all) and `gif-encoder-2`'s octree
  quantiser at low quality bands/dithers badly over an extended capture. It
  was switched to a **real screen recording**: `ffmpeg -f x11grab`
  (`helpers/recorder.ts`) captures whatever the X server actually composites
  for the Electron window's content-bounds region, `xdotool` drives the
  genuine X11 pointer in lockstep with the UI actions (`helpers/realCursor.ts`)
  — cosmetic only, the actual clicks/typing still go through Playwright for
  the same reliability every other demo depends on — and
  `scripts/make-showcase-gif.mjs` converts the recording to
  `docs/public/demo-showcase.gif` via ffmpeg's two-pass palette pipeline
  (`palettegen`/`paletteuse`, proper dithering) instead of `gif-encoder-2`.
  This is deliberately scoped to this one demo only: the other 16 stay on the
  screenshot pipeline, which is simpler and has no external-binary dependency
  beyond the already-required `canvas`. The refresh-gifs workflow gained
  `ffmpeg`/`xdotool` apt packages and a `make-showcase-gif.mjs` step.
  *(That last scoping decision was reversed on 2026-09-02 — see "History
  (encoding)" above: all 17 demos now share the ffmpeg palette pipeline and
  `canvas` is gone. The rest of this note still stands.)*
  The preview itself renders json-schema-for-humans' **flat** template
  (`PreviewWebPanel.ts` avoids the default accordion template, which would
  pull Bootstrap/jQuery from a CDN — a network request this zero-telemetry
  extension doesn't make, per S05). The flat template has no expand/collapse
  — "click a field" therefore targets a field far enough down the page that
  Playwright's actionability scroll-into-view is itself the visible motion,
  rather than an expand/collapse interaction the real product doesn't have.
- **2026-07** — S08-SR-10's UI-smoke job moved from `ci.yml` (every PR/push) to
  `refresh-gifs.yml` (release time, parallel to the GIF-refresh job it shares
  fixtures with). Running on every PR meant it contended for shared runner
  capacity alongside a dozen other concurrent jobs, and made the per-PR CI run
  noticeably slower for a job that gates nothing. The integration job
  (S08-SR-08/09) is unaffected and still runs on every PR.
- **2026-07** — Two demos (`demo-migrate`/`demo-migrate-mouse`,
  `demo-quickfix`/`demo-quickfix-mouse`) reproducibly timed out opening their
  seeded fixture via Quick Open (`Ctrl+P`), on independent runner VMs across
  multiple runs — a real, repeatable issue with Quick Open's async
  file-search for those specific fixtures, not the runner-contention
  flakiness the previous entry blamed it on (that diagnosis was wrong: two
  isolated VMs hitting the identical failure rules out shared-resource
  contention as the cause). Fixed by opening the seeded file via VS Code's own
  CLI launch arguments (`runDemo`'s `openFiles` parameter) instead of driving
  Quick Open at all — sidesteps the flaky code path entirely rather than
  tuning it further. The other 12 demos, whose Quick Open opens are reliable,
  are unchanged.
