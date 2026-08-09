// S08-SR-12/13 — release-time demo/GIF selection. Tests the pure diff-parsing
// and mapping logic directly (dynamic import: scripts/detect-changed-features.mjs
// is genuine ESM); the git/tag plumbing around it is exercised manually
// (see the script's own usage comment) rather than mocked here.
import * as assert from 'assert';

interface DemoEntry {
  name: string;
  dir?: string;
  specs: string[];
}
interface ForceOverride { all: boolean; demos: DemoEntry[]; }
interface DetectModule {
  parseChangedSpecIds(diffOutput: string): string[];
  affectedDemos(changedSpecIds: string[], demos: DemoEntry[]): DemoEntry[];
  buildGrepPattern(names: string[], variant: 'mouse' | 'smoke'): string;
  resolveForceOverride(forceInput: string, demos: DemoEntry[]): ForceOverride | null;
}
const loadModule = async (): Promise<DetectModule> =>
  import('../../../scripts/detect-changed-features.mjs');

const FAKE_DEMOS: DemoEntry[] = [
  { name: 'preview', dir: 'preview-mouse', specs: ['F01'] },
  { name: 'binding', dir: 'binding-mouse', specs: ['F04'] },
  { name: 'showcase', specs: ['F01', 'F02', 'F06'] },
];

suite('S08 — release-scoped demo selection', () => {
  test('[S08-SR-12] parseChangedSpecIds extracts spec ids from a diff listing, ignoring non-spec files', async () => {
    const { parseChangedSpecIds } = await loadModule();
    const diff = [
      'specs/F06-inference.md',
      'specs/traceability.json',
      'src/PreviewWebPanel.ts',
      'specs/S02-workspace-trust.md',
      'specs/F06-inference.md', // duplicate line (e.g. a rename) must not duplicate the id
    ].join('\n');
    assert.deepStrictEqual(parseChangedSpecIds(diff), ['F06', 'S02']);
  });

  test('[S08-SR-12] parseChangedSpecIds returns nothing for an empty or unrelated diff', async () => {
    const { parseChangedSpecIds } = await loadModule();
    assert.deepStrictEqual(parseChangedSpecIds(''), []);
    assert.deepStrictEqual(parseChangedSpecIds('package.json\nsrc/extension.ts'), []);
  });

  test('[S08-SR-13] affectedDemos finds every demo mapped to a changed spec, including multi-spec entries', async () => {
    const { affectedDemos } = await loadModule();
    const affected = affectedDemos(['F06'], FAKE_DEMOS).map((d) => d.name);
    // F06 belongs to both `inference` (not in FAKE_DEMOS here) and `showcase`.
    assert.deepStrictEqual(affected, ['showcase']);
  });

  test('[S08-SR-13] affectedDemos returns nothing when no changed spec has a demo', async () => {
    const { affectedDemos } = await loadModule();
    assert.deepStrictEqual(affectedDemos(['F99'], FAKE_DEMOS), []);
  });

  test('[S08-SR-12] buildGrepPattern builds a mouse/non-mouse alternation that matches only the given demos’ titles', async () => {
    const { buildGrepPattern } = await loadModule();
    const mousePattern = new RegExp(buildGrepPattern(['preview', 'binding'], 'mouse'));
    const smokePattern = new RegExp(buildGrepPattern(['preview', 'binding'], 'smoke'));

    assert.ok(mousePattern.test('demo-preview-mouse: click the editor-title Preview icon'));
    assert.ok(mousePattern.test('demo-binding-mouse: bind a JSON data file'));
    assert.ok(!mousePattern.test('demo-preview: open schema and show preview panel'));
    assert.ok(!mousePattern.test('demo-workspace-validation-mouse: validate every bound file'));

    assert.ok(smokePattern.test('demo-preview: open schema and show preview panel'));
    assert.ok(!smokePattern.test('demo-preview-mouse: click the editor-title Preview icon'));
  });

  test('[S08-SR-12] buildGrepPattern returns an empty string for no affected demos', async () => {
    const { buildGrepPattern } = await loadModule();
    assert.strictEqual(buildGrepPattern([], 'mouse'), '');
  });

  test('[S08-SR-15] resolveForceOverride returns null for an empty or whitespace-only input', async () => {
    const { resolveForceOverride } = await loadModule();
    assert.strictEqual(resolveForceOverride('', FAKE_DEMOS), null);
    assert.strictEqual(resolveForceOverride('   ', FAKE_DEMOS), null);
  });

  test('[S08-SR-15] resolveForceOverride treats "all" (any case) as selecting every demo', async () => {
    const { resolveForceOverride } = await loadModule();
    assert.deepStrictEqual(resolveForceOverride('all', FAKE_DEMOS), { all: true, demos: [] });
    assert.deepStrictEqual(resolveForceOverride('  ALL  ', FAKE_DEMOS), { all: true, demos: [] });
  });

  test('[S08-SR-15] resolveForceOverride selects exactly the named demos, in registry order', async () => {
    const { resolveForceOverride } = await loadModule();
    const result = resolveForceOverride('showcase, preview', FAKE_DEMOS);
    assert.deepStrictEqual(result?.all, false);
    assert.deepStrictEqual(result?.demos.map((d) => d.name), ['preview', 'showcase']);
  });

  test('[S08-SR-15] resolveForceOverride throws on an unrecognised demo name instead of silently narrowing', async () => {
    const { resolveForceOverride } = await loadModule();
    assert.throws(
      () => resolveForceOverride('preview,not-a-real-demo', FAKE_DEMOS),
      /Unknown demo name\(s\).*not-a-real-demo/,
    );
  });
});
