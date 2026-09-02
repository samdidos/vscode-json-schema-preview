// S08-SR-19/SR-20 — demo content and placement.
//
// A demo GIF is regenerated on every release that touches its spec, committed
// to the repo, and served to every visitor. The two ways that investment is
// wasted are a demo that shows the feature *refusing* (S08-SR-19) and a demo
// that is generated and then never displayed anywhere (S08-SR-20). Both are
// silent failures — nothing errors, the GIF just sits there — so they are
// checked here rather than left to review.
import * as assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

interface DemoEntry {
  name: string;
  dir?: string;
  specs: string[];
}
interface RegistryModule {
  DEMOS: DemoEntry[];
}
const loadRegistry = async (): Promise<RegistryModule> => import('../../../scripts/demo-registry.mjs');

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

/** Every markdown page of the docs site, as one searchable blob per file. */
function guidePages(): Map<string, string> {
  const pages = new Map<string, string>();
  const add = (dir: string) => {
    for (const name of readdirSync(resolve(ROOT, dir))) {
      if (name.endsWith('.md')) { pages.set(`${dir}/${name}`, read(`${dir}/${name}`)); }
    }
  };
  add('docs');
  add('docs/guide');
  return pages;
}

suite('S08 — demo content and placement', () => {
  test('[S08-SR-20] every demo is embedded in the landing gallery', async () => {
    const { DEMOS } = await loadRegistry();
    const gallery = read('docs/.vitepress/theme/QuickDemo.vue');

    for (const demo of DEMOS) {
      assert.ok(
        gallery.includes(`demo-${demo.name}.gif`),
        `demo-${demo.name}.gif is generated but missing from the landing gallery`,
      );
    }
  });

  test('[S08-SR-20] every demo is embedded in the guide section documenting it', async () => {
    const { DEMOS } = await loadRegistry();
    const pages = [...guidePages().values()].join('\n');

    for (const demo of DEMOS) {
      // The showcase is the one demo whose second home is the README rather
      // than a guide section — it documents no single command.
      const where = demo.name === 'showcase' ? read('README.md') : pages;
      assert.ok(
        where.includes(`demo-${demo.name}.gif`),
        `demo-${demo.name}.gif is generated but never shown in the docs`,
      );
    }
  });

  test('[S08-SR-20] the README embeds the walkthrough and only the walkthrough', () => {
    // The marketplace renders README.md; seventeen inline GIFs would make that
    // page unusable, so the per-feature demos live on the docs site.
    const readme = read('README.md');
    const embedded = [...readme.matchAll(/demo-([a-z-]+)\.gif/g)].map((m) => m[1]);

    assert.deepStrictEqual([...new Set(embedded)], ['showcase']);
  });

  test('[S08-SR-20] every embedded GIF names a demo that exists', async () => {
    const { DEMOS } = await loadRegistry();
    const known = new Set(DEMOS.map((d) => d.name));
    const sources = [read('README.md'), read('docs/.vitepress/theme/QuickDemo.vue'), ...guidePages().values()];

    for (const source of sources) {
      for (const match of source.matchAll(/demo-([a-z-]+)\.gif/g)) {
        assert.ok(known.has(match[1]), `demo-${match[1]}.gif is referenced but not in the registry`);
      }
    }
  });

  test('[S08-SR-19] a demo of a binding-dependent feature seeds its binding', () => {
    // showcase/data/person-invalid.json ships unbound on purpose: demo-showcase
    // binds it on camera. Any *other* demo that opens it must seed a binding,
    // or the command it demonstrates stops at "No schema bound to
    // person-invalid.json. Bind one first." and demonstrates nothing.
    const dir = 'src/test/e2e';
    for (const name of readdirSync(resolve(ROOT, dir))) {
      if (!name.endsWith('.test.ts')) { continue; }
      const source = read(`${dir}/${name}`);
      if (!source.includes('person-invalid.json')) { continue; }
      if (name.startsWith('demo-showcase')) { continue; }

      assert.ok(
        source.includes('json.schemas') || source.includes('$schema'),
        `${name} opens person-invalid.json without seeding a binding — the demo will end on a refusal`,
      );
    }
  });
});
