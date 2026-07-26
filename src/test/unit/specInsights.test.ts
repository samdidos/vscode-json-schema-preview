// S10-SR-09..13, S10-SR-17 and S10-SR-23 — the docs-site metric columns, the
// column-visibility control, the sidebar indicator and the insights page
// (KPIs and charts). These surfaces are Vue/config
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
const gitHistory = read('docs/.vitepress/gitHistory.ts');

suite('S10 — matrix metrics, column control and insights page', () => {
  test('[S10-SR-09] the matrix renders effort, value and RICE columns', () => {
    for (const header of ['Effort', 'Value', 'RICE']) {
      assert.ok(
        matrixVue.includes(`${header}<span`),
        `matrix is missing the ${header} column`,
      );
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

  test('[S10-SR-09] the RICE cell carries a bar proportional to the corpus best', () => {
    assert.match(matrixVue, /const maxRice = computed/);
    assert.match(matrixVue, /spec-matrix-rice-bar/);
    assert.match(matrixVue, /\(spec\.metrics\.rice \?\? 0\) \/ maxRice/);
    // Scaled against the full corpus, not the filtered rows, so filtering
    // never rescales the bars.
    const block = matrixVue.slice(
      matrixVue.indexOf('const maxRice'),
      matrixVue.indexOf('const sorted'),
    );
    assert.ok(block.includes('data.specs'), 'maxRice must scale to the full data set');
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
    // The id header carries no v-if, so it always renders.
    const idHeader = matrixVue.slice(
      matrixVue.indexOf('<thead>'),
      matrixVue.indexOf("toggleSort('id')"),
    );
    assert.ok(!idHeader.includes('v-if'), 'the spec id column must not be conditionally rendered');
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

  test('[S10-SR-16] every column header is clickable and cycles through sort states', () => {
    const sortKeys = ['id', 'title', 'kind', 'requirements', 'effort', 'value', 'rice'];
    for (const key of sortKeys) {
      assert.match(
        matrixVue,
        new RegExp(`@click="toggleSort\\('${key}'\\)"`),
        `header for ${key} must call toggleSort`,
      );
      assert.match(
        matrixVue,
        new RegExp(`:aria-sort="ariaSort\\('${key}'\\)"`),
        `header for ${key} must expose aria-sort`,
      );
    }
    const toggle = matrixVue.slice(
      matrixVue.indexOf('function toggleSort'),
      matrixVue.indexOf('function ariaSort'),
    );
    // unsorted -> asc -> desc -> unsorted, per header.
    assert.match(toggle, /sortDir\.value = 'asc'/);
    assert.match(toggle, /sortDir\.value = 'desc'/);
    assert.match(toggle, /sortKey\.value = null/);
  });

  test('[S10-SR-16] an unscored metric always sorts after every scored row', () => {
    const sortedBlock = matrixVue.slice(matrixVue.indexOf('const sorted = computed'));
    assert.match(sortedBlock, /va === null \|\| vb === null/);
    assert.match(sortedBlock, /va === null \? 1 : -1/);
    // Row order comes from the sorted list, not the raw filtered list.
    assert.match(matrixVue, /v-for="spec in sorted"/);
  });

  test('[S10-SR-23] the matrix renders a Release column joined from the spec\'s own git history', () => {
    assert.ok(matrixVue.includes('Release<span'), 'matrix is missing the Release column');
    const block = matrixVue.slice(
      matrixVue.indexOf('const COLUMN_LABELS'),
      matrixVue.indexOf('const columnOptions'),
    );
    assert.ok(block.includes('release:'), 'release must be toggleable');
    assert.match(matrixVue, /release: releaseSortValue/);
    // Never a hand-edited field: resolved from the spec's oldest commit
    // against release-please's release commits, same infra as S10-SR-14.
    assert.match(specsLoader, /readSpecHistory/);
    assert.match(specsLoader, /buildReleaseResolver/);
    assert.match(specsLoader, /release: resolveRelease/);
    assert.match(gitHistory, /chore\(main\): release/);
  });

  test('[S10-SR-23] unreleased and no-history specs render distinct explicit placeholders', () => {
    assert.match(matrixVue, /state === 'unreleased'/);
    assert.match(matrixVue, /unreleased</);
    assert.match(matrixVue, /no history</);
    assert.match(matrixVue, /No history available for this spec file in this checkout/);
    // Both placeholder states must fall through the same null-sorts-last path
    // as an unscored metric (S10-SR-09) — never a real version number.
    assert.match(matrixVue, /if \(state !== 'released' \|\| !version\) return null/);
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

  test('[S10-SR-12] per-spec RICE is not listed here — the matrix owns the ranking', () => {
    assert.ok(
      !insightsVue.includes('<table'),
      'the insights page must not render a per-spec table',
    );
    // The best-RICE KPI still derives from the sorted list, but only its head
    // is shown; the full ranking is the matrix RICE column (S10-SR-09/16).
    const block = insightsVue.slice(insightsVue.indexOf('const byRice'));
    assert.match(block, /metrics\.rice !== null/);
  });

  test('[S10-SR-17] the counted section charts requirements by status per spec', () => {
    assert.match(insightsVue, /insights-status-chart/);
    assert.match(insightsVue, /s\.counts\[st\]/);
    // Fill colors follow the badge hues via per-status selectors.
    for (const status of ['implemented', 'manual', 'planned', 'untracked', 'deferred']) {
      assert.ok(
        insightsVue.includes(`data-status='${status}'`),
        `${status} segments need a badge-matching fill`,
      );
    }
    // Every segment exposes its exact count (tooltip), never only a length.
    assert.match(insightsVue, /:title="`\$\{row\.id\}/);
  });

  test('[S10-SR-17] the advisory section plots value against effort with tier bands and RICE guides', () => {
    assert.match(insightsVue, /insights-scatter/);
    assert.match(insightsVue, /TIER_BANDS/);
    assert.match(insightsVue, /RICE_GUIDES/);
    // Tier bands mirror the S16 chart's boundaries.
    const bands = insightsVue.slice(
      insightsVue.indexOf('const TIER_BANDS'),
      insightsVue.indexOf('const RICE_GUIDES'),
    );
    for (const bound of ['2.5', '6', '12', '20']) {
      assert.ok(bands.includes(bound), `tier boundary ${bound} must match S16`);
    }
  });

  test('[S10-SR-17] co-located features merge into one labelled mark', () => {
    assert.match(insightsVue, /\$\{s\.metrics\.points\}\|\$\{s\.metrics\.value\}/);
    assert.match(insightsVue, /ids\.join/);
  });

  test('[S10-SR-17] distributions render as labelled count bars', () => {
    assert.match(insightsVue, /insights-dist-bar/);
    assert.match(insightsVue, /tierBars/);
    assert.match(insightsVue, /sizeBars/);
  });

  test('[S10-SR-18] the ageing chart reuses S13\'s rubric rather than restating the bands', () => {
    assert.match(specsLoader, /from '\.\.\/\.\.\/scripts\/spec-effort\.mjs'/);
    assert.match(specsLoader, /computeEvidence/);
    assert.match(specsLoader, /basePointsForLoc/);
    // The drift flag must be the comparison the checker makes, not a copy of
    // the band table living in the loader or the component.
    assert.match(specsLoader, /liveBase !== recordedBase/);
    assert.ok(
      !/LOC_BANDS/.test(specsLoader) && !/LOC_BANDS/.test(insightsVue),
      'the band table must not be duplicated outside scripts/spec-effort.mjs',
    );
  });

  test('[S10-SR-18] the ageing chart plots the recorded snapshot against live size', () => {
    assert.match(insightsVue, /const ageing = computed/);
    assert.match(insightsVue, /evidence\.recordedLoc/);
    assert.match(insightsVue, /evidence\.liveLoc/);
    // The equality diagonal is what makes "has not moved" readable.
    assert.match(insightsVue, /diagonal/);
    // Drifted specs are named, not only coloured.
    assert.match(insightsVue, /insights-dot-drift/);
    assert.match(insightsVue, /v-if="m\.drifts"/);
  });

  test('[S10-SR-18] the rejected circular chart is recorded, not built', () => {
    // Points are derived from LOC, so points-vs-LOC cannot falsify the rubric.
    const spec = read('specs/S10-spec-visualization.md');
    assert.match(spec, /circular by construction/);
    assert.match(insightsVue, /circular/);
  });

  test('[S10-SR-19] demo coverage is read from the S08 registry, never hand-listed', () => {
    assert.match(specsLoader, /from '\.\.\/\.\.\/scripts\/demo-registry\.mjs'/);
    assert.match(specsLoader, /DEMOS\.flatMap/);
    assert.match(specsLoader, /hasDemo/);
    assert.match(insightsVue, /const demoCoverage = computed/);
  });

  test('[S10-SR-19] a spec with no demo is distinguishable beyond colour', () => {
    assert.match(insightsVue, /insights-dot-hollow/);
    // A visible "no demo" label rides the high-value gaps.
    assert.match(insightsVue, /no demo/);
    assert.match(insightsVue, /!row\.hasDemo/);
  });

  test('[S10-SR-20] test strength is plotted against value, not line coverage', () => {
    assert.match(insightsVue, /const strength = computed/);
    assert.match(insightsVue, /mutationScore/);
    // Coverage was rejected as the axis: the 80% gate flattens it.
    assert.match(insightsVue, /line coverage/);
    assert.match(read('specs/S10-spec-visualization.md'), /Line coverage MUST NOT be used/);
    // A spec's score comes from merging its files' raw tallies and scoring
    // them with S18's own function — not from averaging the per-file scores,
    // which are rounded and whose mutant counts include statuses the score's
    // denominator excludes.
    assert.match(specsLoader, /scoreOf\(merged\)/);
    assert.match(specsLoader, /from '\.\.\/\.\.\/scripts\/mutation-score\.mjs'/);
    assert.ok(
      !/entry\.score \/ 100/.test(specsLoader),
      'a per-spec score must not be reconstructed from rounded per-file scores',
    );
  });

  test('[S10-SR-20] an unmeasured score renders as "not measured", never as zero', () => {
    assert.match(insightsVue, /Not measured/);
    assert.match(insightsVue, /strength\.measured/);
    assert.match(specsLoader, /mutationScore: mutationFor/);
    // The loader must not default a missing score to a number.
    assert.ok(
      !/mutationScore: [^n]*\?\? 0/.test(specsLoader),
      'a missing mutation score must stay null',
    );
  });

  test('[S10-SR-21] the lifecycle chart separates unstamped from same-day', () => {
    assert.match(insightsVue, /const lifecycle = computed/);
    assert.match(insightsVue, /specifiedAt/);
    assert.match(insightsVue, /implementedAt/);
    // "predates stamping" is its own count, not a zero-day bar.
    assert.match(insightsVue, /predate stamping/);
    assert.match(insightsVue, /untracked: all\.length - tracked\.length/);
  });

  test('[S10-SR-21] the lifecycle chart renders an explicit empty state', () => {
    assert.match(insightsVue, /insights-empty/);
    assert.match(insightsVue, /lifecycle\.buckets\.length/);
    assert.match(insightsVue, /fills in as the corpus grows/);
  });

  test('[S10-SR-17] the charts introduce no runtime chart dependency', () => {
    const docsPkg = JSON.parse(read('docs/package.json'));
    const deps = Object.keys({ ...docsPkg.dependencies, ...docsPkg.devDependencies });
    assert.ok(
      !deps.some((d) => /chart|\bd3\b|echarts|plotly|vega/i.test(d)),
      'insights charts must stay hand-rolled SVG/CSS (S10-NFR-02)',
    );
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
