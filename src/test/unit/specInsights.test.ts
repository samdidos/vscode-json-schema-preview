// S10-SR-09..13 — the docs-site metric columns, the column-visibility control,
// the sidebar indicator and the insights page. These surfaces are Vue/config
// files outside the extension bundle, so they are asserted structurally here:
// the guarantee that matters is that every figure comes from the committed
// spec artifacts and that advisory estimates stay visibly separated from
// counted facts.
import * as assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const matrixVue = read('docs/.vitepress/theme/SpecMatrix.vue');
const dropdownVue = read('docs/.vitepress/theme/SpecFilterDropdown.vue');
const insightsVue = read('docs/.vitepress/theme/SpecInsights.vue');
const specsLoader = read('docs/.vitepress/specs.data.ts');
const config = read('docs/.vitepress/config.ts');

suite('S10 — matrix metrics, column control and insights page', () => {
  test('[S10-SR-09] the matrix renders effort, value and RICE columns', () => {
    for (const header of ['Effort', 'Value', 'RICE']) {
      assert.ok(matrixVue.includes(`>${header}<`), `matrix is missing the ${header} column`);
    }
    for (const field of ['metrics.points', 'metrics.tshirt', 'metrics.value', 'metrics.tier', 'metrics.rice']) {
      assert.ok(matrixVue.includes(field), `matrix does not read ${field}`);
    }
  });

  test('[S10-SR-09] an unscored spec shows a placeholder rather than a zero', () => {
    assert.match(matrixVue, /spec-matrix-unscored/);
    assert.match(matrixVue, /not scored/);
    // A v-else branch must exist for each optional metric, so a missing
    // estimate can never fall through to a numeric default.
    assert.ok(
      (matrixVue.match(/v-else/g) ?? []).length >= 3,
      'each optional metric needs an explicit unscored branch',
    );
  });

  test('[S10-SR-09] metrics are joined from the committed estimate files, not hand-copied', () => {
    assert.match(specsLoader, /effort\.json/);
    assert.match(specsLoader, /value\.json/);
    // RICE is derived in the loader (S16-SR-05), never read from a stored field.
    assert.match(specsLoader, /rice:/);
    assert.ok(!/"rice"/.test(read('specs/value.json')), 'value.json must not store rice');
  });

  test('[S10-SR-10] every column except the spec id can be toggled', () => {
    const block = matrixVue.slice(
      matrixVue.indexOf('const COLUMN_LABELS'),
      matrixVue.indexOf('const columnOptions'),
    );
    for (const col of ['title', 'kind', 'requirements', 'effort', 'value', 'rice']) {
      assert.ok(block.includes(`${col}:`), `${col} must be toggleable`);
    }
    assert.ok(!/^\s*id:/m.test(block), 'the spec id column must not be toggleable');
    // The id cell carries no v-if, so it always renders.
    assert.match(matrixVue, /<th>Spec<\/th>/);
  });

  test('[S10-SR-10] the column control reports how many columns are visible', () => {
    assert.match(matrixVue, /columnSummary/);
    assert.match(matrixVue, /of \$\{columnOptions\.length\}/);
    // The dropdown must accept the override; its filter wording ("All") would
    // be wrong for a column selector, where empty means "none shown".
    assert.match(dropdownVue, /summary\?: string/);
    assert.match(dropdownVue, /props\.summary !== undefined/);
  });

  test('[S10-SR-10] column visibility does not affect which specs match', () => {
    const filterBlock = matrixVue.slice(
      matrixVue.indexOf('const filtered'),
      matrixVue.indexOf('const totalRequirements'),
    );
    assert.ok(
      !filterBlock.includes('visibleColumns'),
      'the row filter must not consider column visibility',
    );
  });

  test('[S10-SR-11] sidebar entries carry a compact T-shirt and RICE indicator', () => {
    assert.match(config, /spec-nav-badge/);
    assert.match(config, /spec-nav-rice/);
    assert.match(config, /effort\.json/);
    assert.match(config, /value\.json/);
    assert.match(read('docs/.vitepress/theme/style.css'), /\.spec-nav-badge/);
  });

  test('[S10-SR-12] the insights page reports the corpus KPIs', () => {
    assert.match(read('docs/specs/insights.md'), /<SpecInsights \/>/);
    assert.match(read('docs/.vitepress/theme/index.ts'), /app\.component\('SpecInsights', SpecInsights\)/);
    for (const kpi of ['requirements', 'tagRate', 'meanPerSpec', 'byTier', 'bySize', 'byRice']) {
      assert.ok(insightsVue.includes(kpi), `insights page is missing the ${kpi} KPI`);
    }
    // Coverage figures reuse the shared S07 library rather than recomputing.
    assert.match(insightsVue, /docCoverage\.data/);
  });

  test('[S10-SR-12] the RICE ranking covers every scored feature spec, best first', () => {
    const block = insightsVue.slice(insightsVue.indexOf('const byRice'));
    assert.match(block, /kind === 'feature'|features\.value/);
    assert.match(block, /metrics\.rice !== null/);
    assert.match(block, /\(b\.metrics\.rice \?\? 0\) - \(a\.metrics\.rice \?\? 0\)/);
  });

  test('[S10-SR-13] advisory estimates are separated from counted facts', () => {
    const countedAt = insightsVue.indexOf('id="counted"');
    const advisoryAt = insightsVue.indexOf('id="advisory"');
    assert.ok(countedAt > -1 && advisoryAt > countedAt, 'counted facts must come first');
    assert.match(insightsVue, /These are judgements, not measurements/);
    assert.match(insightsVue, /insights-kpi-advisory/);
    // The advisory block must point at both rubrics and disclaim the score.
    const advisory = insightsVue.slice(advisoryAt);
    assert.match(advisory, /specs\/S13/);
    assert.match(advisory, /specs\/S16/);
    assert.match(advisory, /maturity score/);
  });
});
