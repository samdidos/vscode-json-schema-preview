// S08-SR-13 — the demo <-> spec mapping lives in exactly one place,
// scripts/demo-registry.mjs. These tests guard its shape: every entry names
// real specs, names are unique, and every non-showcase entry has the `dir`
// scripts/make-gifs.mjs needs.
import * as assert from 'assert';
import { readdirSync } from 'fs';
import { resolve } from 'path';

interface DemoEntry {
  name: string;
  dir?: string;
  delay?: number;
  hold?: number;
  specs: string[];
}
interface RegistryModule {
  DEMOS: DemoEntry[];
  findDemo(name: string): DemoEntry | undefined;
}
const loadModule = async (): Promise<RegistryModule> => import('../../../scripts/demo-registry.mjs');

const ROOT = resolve(__dirname, '../../../');
const knownSpecIds = () =>
  new Set(
    readdirSync(resolve(ROOT, 'specs'))
      .filter((n) => /^[FS]\d{2}-.*\.md$/.test(n))
      .map((n) => n.slice(0, 3)),
  );

suite('S08 — demo registry', () => {
  test('[S08-SR-13] every demo name is unique', async () => {
    const { DEMOS } = await loadModule();
    const names = DEMOS.map((d) => d.name);
    assert.deepStrictEqual(names, [...new Set(names)]);
  });

  test('[S08-SR-13] every demo names at least one real, existing spec', async () => {
    const { DEMOS } = await loadModule();
    const known = knownSpecIds();
    for (const demo of DEMOS) {
      assert.ok(demo.specs.length > 0, `${demo.name}: specs[] must not be empty`);
      for (const spec of demo.specs) {
        assert.ok(known.has(spec), `${demo.name}: unknown spec "${spec}"`);
      }
    }
  });

  test('[S08-SR-13] every entry but showcase has a screenshots `dir` for make-gifs.mjs', async () => {
    const { DEMOS } = await loadModule();
    for (const demo of DEMOS) {
      if (demo.name === 'showcase') {
        assert.strictEqual(demo.dir, undefined);
      } else {
        assert.ok(typeof demo.dir === 'string' && demo.dir.length > 0, `${demo.name}: missing dir`);
      }
    }
  });

  test('[S08-SR-13] findDemo looks up by name', async () => {
    const { findDemo } = await loadModule();
    assert.strictEqual(findDemo('preview')?.specs[0], 'F01');
    assert.strictEqual(findDemo('does-not-exist'), undefined);
  });
});
