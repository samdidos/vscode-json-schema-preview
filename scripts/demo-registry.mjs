#!/usr/bin/env node
// Single source of truth for "which demo Playwright script/GIF belongs to
// which spec" (S08-SR-13). Consumed by scripts/make-gifs.mjs (GIF generation)
// and scripts/detect-changed-features.mjs (release-time change detection) so
// the mapping is never duplicated between the two.
//
// Each entry's `name` matches the `demo-<name>`/`demo-<name>-mouse` test
// titles in src/test/e2e/. `dir` is the screenshots/ subdirectory the mouse
// twin's frames land in, consumed by make-gifs.mjs — entries without a `dir`
// (currently only `showcase`) are captured by a different script
// (scripts/make-showcase-gif.mjs) and are skipped by make-gifs.mjs's own
// loop, but still participate in demo selection like any other entry.
//
// `specs` lists every requirement-spec id (F* or S*) that demo exercises;
// S08-SR-12 uses it to decide, at release time, which demos need re-running.
export const DEMOS = [
  { name: 'preview', dir: 'preview-mouse', delay: 220, hold: 1_200, specs: ['F01'] },
  { name: 'validation', dir: 'validation-mouse', delay: 220, hold: 1_400, specs: ['F03'] },
  { name: 'inference', dir: 'inference-mouse', delay: 220, hold: 1_400, specs: ['F06'] },
  { name: 'binding', dir: 'binding-mouse', delay: 220, hold: 1_200, specs: ['F04'] },
  { name: 'live-update', dir: 'live-update-mouse', delay: 220, hold: 1_000, specs: ['F02'] },
  { name: 'visual-editor', dir: 'visual-editor-mouse', delay: 220, hold: 1_200, specs: ['F05'] },
  { name: 'workspace-trust', dir: 'workspace-trust-mouse', delay: 220, hold: 1_400, specs: ['S02'] },
  { name: 'schema-auth', dir: 'schema-auth-mouse', delay: 220, hold: 1_200, specs: ['F07'] },
  { name: 'codegen', dir: 'codegen-mouse', delay: 220, hold: 1_400, specs: ['F18'] },
  { name: 'sample-data', dir: 'sample-data-mouse', delay: 220, hold: 1_400, specs: ['F16'] },
  { name: 'bundling', dir: 'bundling-mouse', delay: 220, hold: 1_400, specs: ['F14'] },
  { name: 'ref-navigation', dir: 'ref-navigation-mouse', delay: 220, hold: 1_200, specs: ['F13'] },
  { name: 'schema-linting', dir: 'schema-linting-mouse', delay: 220, hold: 1_400, specs: ['F17'] },
  { name: 'workspace-validation', dir: 'workspace-validation-mouse', delay: 220, hold: 1_400, specs: ['F20'] },
  { name: 'quick-fix', dir: 'quick-fix-mouse', delay: 220, hold: 1_400, specs: ['F21'] },
  { name: 'draft-migration', dir: 'draft-migration-mouse', delay: 220, hold: 1_400, specs: ['F22'] },
  // Chains inference (F06) -> preview (F01) -> live-edit (F02); see the 2026-07
  // History note in specs/S08-e2e-testing.md for the exact narrative. Captured
  // via scripts/make-showcase-gif.mjs (real screen recording), not this file's
  // screenshot-stitch pipeline, hence no `dir`/`delay`/`hold`.
  { name: 'showcase', specs: ['F01', 'F02', 'F06'] },
];

export function findDemo(name) {
  return DEMOS.find((d) => d.name === name);
}
