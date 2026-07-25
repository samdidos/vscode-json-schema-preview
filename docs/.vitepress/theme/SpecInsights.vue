<script setup lang="ts">
// Corpus-level KPIs and charts for the spec set (S10-SR-12/13/17). Every
// figure is derived at build time from specs/ — nothing here is
// hand-maintained.
//
// The page is deliberately split in two (S10-SR-13): counted facts first
// (requirements, statuses, tag and documentation coverage), then advisory
// estimates behind a clear divider. Effort and value are judgements, and
// putting them in the same block as the counts would lend them an authority
// they have not earned.
//
// Per-spec RICE lives on the matrix page only (S10-SR-12): its RICE column
// sorts and carries a proportional bar, so repeating the ranking here would
// be a second copy of the same table.
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as specsData } from '../specs.data'
import type { SpecEntry } from '../specs.data'
import { data as docData } from '../docCoverage.data'
import SpecStatusBadge from './SpecStatusBadge.vue'

const specs = specsData.specs
const features = computed(() => specs.filter((s) => s.kind === 'feature'))

const totals = computed(() => {
  const requirements = specs.reduce((n, s) => n + s.requirements.length, 0)
  const tagged = specs.reduce((n, s) => n + s.tagged, 0)
  const counts: Record<string, number> = {}
  for (const s of specs) {
    for (const [status, n] of Object.entries(s.counts)) counts[status] = (counts[status] ?? 0) + n
  }
  return {
    specs: specs.length,
    features: features.value.length,
    system: specs.length - features.value.length,
    requirements,
    tagged,
    tagRate: requirements ? Math.round((tagged / requirements) * 100) : 0,
    counts,
    meanPerSpec: specs.length ? (requirements / specs.length).toFixed(1) : '0',
  }
})

const docs = computed(() => {
  const rows = docData.specs
  const covered = rows.filter((s) => s.coverage >= 1).length
  const words = rows.reduce((n, s) => n + s.actualWords, 0)
  const mean = rows.length
    ? Math.round((rows.reduce((n, s) => n + s.coverage, 0) / rows.length) * 100)
    : 0
  return { covered, total: rows.length, words, mean }
})

const effort = computed(() => {
  const scored = specs.filter((s) => s.metrics.points !== null)
  const points = scored.reduce((n, s) => n + (s.metrics.points ?? 0), 0)
  const bySize: Record<string, number> = {}
  for (const s of scored) {
    const t = s.metrics.tshirt
    if (t) bySize[t] = (bySize[t] ?? 0) + 1
  }
  return {
    points,
    scored: scored.length,
    mean: scored.length ? (points / scored.length).toFixed(1) : '0',
    // Solo-human hour anchor from the S13 chart, at ~4 h per point mid-band.
    bySize,
  }
})

const TIER_ORDER = ['Critical', 'High', 'Moderate', 'Niche', 'Marginal']
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const value = computed(() => {
  const scored = features.value.filter((s) => s.metrics.value !== null)
  const total = scored.reduce((n, s) => n + (s.metrics.value ?? 0), 0)
  const byTier: Record<string, number> = {}
  for (const s of scored) {
    const t = s.metrics.tier
    if (t) byTier[t] = (byTier[t] ?? 0) + 1
  }
  return {
    scored: scored.length,
    total: total.toFixed(1),
    mean: scored.length ? (total / scored.length).toFixed(1) : '0',
    byTier,
    tiers: TIER_ORDER.filter((t) => byTier[t]),
  }
})

const byRice = computed(() =>
  features.value
    .filter((s) => s.metrics.rice !== null)
    .slice()
    .sort((a, b) => (b.metrics.rice ?? 0) - (a.metrics.rice ?? 0)),
)
const byValue = computed(() =>
  features.value
    .filter((s) => s.metrics.value !== null)
    .slice()
    .sort((a, b) => (b.metrics.value ?? 0) - (a.metrics.value ?? 0))
    .slice(0, 5),
)

// ---- Requirements-by-status chart (S10-SR-17) --------------------------
// Stack order is fixed so risky color adjacencies (yellow beside red) can
// never occur; statuses the matrix might grow later append at the end.
const STACK_ORDER = ['implemented', 'manual', 'planned', 'deferred', 'untracked']
const statusOrder = computed(() => {
  const declared = Object.keys(specsData.statuses)
  return [
    ...STACK_ORDER.filter((s) => declared.includes(s)),
    ...declared.filter((s) => !STACK_ORDER.includes(s)),
  ]
})
const orderedTotals = computed(() =>
  statusOrder.value
    .filter((s) => totals.value.counts[s])
    .map((s) => ({ status: s, count: totals.value.counts[s] })),
)
const statusChart = computed(() => {
  const max = Math.max(...specs.map((s) => s.requirements.length), 1)
  const rows = specs.map((s) => ({
    id: s.id,
    title: s.title,
    total: s.requirements.length,
    segments: statusOrder.value
      .filter((st) => s.counts[st])
      .map((st) => ({ status: st, count: s.counts[st] })),
  }))
  return { rows, max }
})

// ---- Value-vs-effort scatter (S10-SR-17) -------------------------------
// Tier bands mirror the S16 chart (validated by check:spec-value); the
// constant-RICE diagonals make value-per-effort readable as slope, replacing
// the ranking table this page used to duplicate from the matrix.
const TIER_BANDS = [
  { tier: 'Marginal', from: 0, to: 2.5 },
  { tier: 'Niche', from: 2.5, to: 6 },
  { tier: 'Moderate', from: 6, to: 12 },
  { tier: 'High', from: 12, to: 20 },
  { tier: 'Critical', from: 20, to: 30 },
]
const RICE_GUIDES = [0.5, 1, 2, 4]
const PLOT = { w: 720, h: 400, left: 40, right: 88, top: 16, bottom: 40 }

interface ScatterMark {
  ids: string[]
  cx: number
  cy: number
  points: number
  value: number
  rice: number | null
  label: string | null
}

const scatter = computed(() => {
  const scored = features.value.filter(
    (s) => s.metrics.value !== null && s.metrics.points !== null,
  )
  const xMax = Math.max(...scored.map((s) => s.metrics.points ?? 0), 1) + 1
  const yMax = Math.max(30, ...scored.map((s) => s.metrics.value ?? 0))
  const x = (v: number) => PLOT.left + (v / xMax) * (PLOT.w - PLOT.left - PLOT.right)
  const y = (v: number) =>
    PLOT.h - PLOT.bottom - (v / yMax) * (PLOT.h - PLOT.top - PLOT.bottom)

  // Merge co-located specs into one mark (S10-SR-17): several features share
  // exact (points, value) pairs and would overplot into a single dot.
  const groups = new Map<string, SpecEntry[]>()
  for (const s of scored) {
    const key = `${s.metrics.points}|${s.metrics.value}`
    groups.set(key, [...(groups.get(key) ?? []), s])
  }

  // Direct labels only on the extremes (highest value, best RICE, biggest
  // effort) — the rest identify via their tooltip and the matrix table.
  const labelled = new Set<string>()
  const byMetric = (pick: (s: SpecEntry) => number | null) =>
    scored.slice().sort((a, b) => (pick(b) ?? 0) - (pick(a) ?? 0))[0]
  for (const s of [
    byMetric((e) => e.metrics.value),
    byMetric((e) => e.metrics.rice),
    byMetric((e) => e.metrics.points),
  ]) {
    if (s) labelled.add(`${s.metrics.points}|${s.metrics.value}`)
  }

  const marks: ScatterMark[] = [...groups.entries()].map(([key, list]) => {
    const m = list[0].metrics
    const ids = list.map((s) => s.id)
    return {
      ids,
      cx: x(m.points ?? 0),
      cy: y(m.value ?? 0),
      points: m.points ?? 0,
      value: m.value ?? 0,
      rice: m.rice,
      label: labelled.has(key) ? ids.join(' ') : null,
    }
  })

  const guides = RICE_GUIDES.map((rice) => {
    const xEnd = Math.min(xMax, yMax / rice)
    return { rice, x1: x(0), y1: y(0), x2: x(xEnd), y2: y(rice * xEnd) }
  })

  const bands = TIER_BANDS.filter((b) => b.from < yMax).map((b) => ({
    tier: b.tier,
    y: y(Math.min(b.to, yMax)),
    mid: y((b.from + Math.min(b.to, yMax)) / 2),
  }))

  const xTicks = [0, 5, 10].filter((t) => t <= xMax).map((t) => ({ v: t, x: x(t) }))
  const yTicks = [0, 10, 20, 30].filter((t) => t <= yMax).map((t) => ({ v: t, y: y(t) }))

  return { marks, guides, bands, xTicks, yTicks, x0: x(0), y0: y(0) }
})

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const markTip = (m: ScatterMark) =>
  `${m.ids.join(', ')} — value ${fmt(m.value)} · ${m.points} pts · RICE ${
    m.rice === null ? '—' : m.rice.toFixed(2)
  }`

// ---- Distribution bars (S10-SR-17) -------------------------------------
const tierBars = computed(() => {
  const rows = value.value.tiers.map((t) => ({ label: t, count: value.value.byTier[t] }))
  return { rows, max: Math.max(...rows.map((r) => r.count), 1) }
})
const sizeBars = computed(() => {
  const bySize = effort.value.bySize
  const rows = SIZE_ORDER.filter((s) => bySize[s]).map((s) => ({
    label: s,
    count: bySize[s],
  }))
  return { rows, max: Math.max(...rows.map((r) => r.count), 1) }
})
</script>

<template>
  <div class="insights">
    <h2 id="counted">Counted facts</h2>
    <p class="insights-note">
      Everything in this section is a count taken from the spec files and the
      traceability matrix at build time.
    </p>

    <div class="insights-grid">
      <div class="insights-kpi">
        <span class="insights-kpi-value">{{ totals.specs }}</span>
        <span class="insights-kpi-label">specs</span>
        <span class="insights-kpi-sub">{{ totals.features }} feature · {{ totals.system }} system</span>
      </div>
      <div class="insights-kpi">
        <span class="insights-kpi-value">{{ totals.requirements }}</span>
        <span class="insights-kpi-label">requirements</span>
        <span class="insights-kpi-sub">{{ totals.meanPerSpec }} per spec on average</span>
      </div>
      <div class="insights-kpi">
        <span class="insights-kpi-value">{{ totals.tagRate }}<small>%</small></span>
        <span class="insights-kpi-label">carry a test tag</span>
        <span class="insights-kpi-sub">{{ totals.tagged }} of {{ totals.requirements }} requirements</span>
      </div>
      <div class="insights-kpi">
        <span class="insights-kpi-value">{{ docs.mean }}<small>%</small></span>
        <span class="insights-kpi-label">mean doc coverage</span>
        <span class="insights-kpi-sub">{{ docs.covered }} of {{ docs.total }} specs fully documented</span>
      </div>
    </div>

    <h3>Requirements by status</h3>
    <p class="insights-badges">
      <SpecStatusBadge
        v-for="entry in orderedTotals"
        :key="entry.status"
        :status="entry.status"
        :count="entry.count"
      />
    </p>
    <p class="insights-note">
      One bar per spec, segments colored like the badges above; bar length
      compares requirement counts across specs. Hover a segment for its exact
      count.
    </p>
    <div class="insights-status-chart">
      <div v-for="row in statusChart.rows" :key="row.id" class="insights-status-row">
        <a class="insights-status-id" :href="withBase(`/specs/${row.id}`)">{{ row.id }}</a>
        <div class="insights-status-track">
          <span
            v-for="seg in row.segments"
            :key="seg.status"
            class="insights-seg"
            :data-status="seg.status"
            :style="{ width: `${(seg.count / statusChart.max) * 100}%` }"
            :title="`${row.id} ${row.title} — ${seg.count} of ${row.total} ${seg.status}`"
          />
        </div>
        <span class="insights-status-total">{{ row.total }}</span>
      </div>
    </div>

    <hr class="insights-divider" />

    <h2 id="advisory">Advisory estimates</h2>
    <p class="insights-note insights-note-warn">
      <strong>These are judgements, not measurements.</strong> Effort comes from
      the <a :href="withBase('/specs/S13')">S13</a> rubric and value from
      <a :href="withBase('/specs/S16')">S16</a>; neither feeds the
      <a :href="withBase('/maturity/')">maturity score</a>, which is built from
      observable facts only.
    </p>

    <div class="insights-grid">
      <div class="insights-kpi insights-kpi-advisory">
        <span class="insights-kpi-value">{{ effort.points }}</span>
        <span class="insights-kpi-label">story points total</span>
        <span class="insights-kpi-sub">{{ effort.mean }} mean across {{ effort.scored }} specs</span>
      </div>
      <div class="insights-kpi insights-kpi-advisory">
        <span class="insights-kpi-value">{{ value.total }}</span>
        <span class="insights-kpi-label">customer value total</span>
        <span class="insights-kpi-sub">{{ value.mean }} mean across {{ value.scored }} features</span>
      </div>
      <div class="insights-kpi insights-kpi-advisory">
        <span class="insights-kpi-value">{{ byRice[0]?.metrics.rice?.toFixed(2) }}</span>
        <span class="insights-kpi-label">best RICE</span>
        <span class="insights-kpi-sub">{{ byRice[0]?.id }} · {{ byRice[0]?.title }}</span>
      </div>
      <div class="insights-kpi insights-kpi-advisory">
        <span class="insights-kpi-value">{{ byValue[0]?.metrics.value?.toFixed(1) }}</span>
        <span class="insights-kpi-label">highest value</span>
        <span class="insights-kpi-sub">{{ byValue[0]?.id }} · {{ byValue[0]?.title }}</span>
      </div>
    </div>

    <h3>Value against effort</h3>
    <p class="insights-note">
      Each dot is a scored feature spec (dots sharing the same estimates are
      merged — hover for the spec ids). Height is the S16 value score with its
      tier bands; the diagonals are constant RICE, so steeper-than-a-guide
      means more value per point. The full per-spec numbers live in the
      <a :href="withBase('/specs/matrix')">matrix</a>, sortable by RICE.
    </p>
    <svg
      class="insights-scatter"
      :viewBox="`0 0 ${PLOT.w} ${PLOT.h}`"
      role="img"
      aria-label="Scatter plot of customer value against effort points for every scored feature spec"
    >
      <!-- tier bands (S16) -->
      <g v-for="band in scatter.bands" :key="band.tier">
        <line
          class="insights-scatter-grid"
          :x1="PLOT.left"
          :x2="PLOT.w - PLOT.right"
          :y1="band.y"
          :y2="band.y"
        />
        <text class="insights-scatter-band" :x="PLOT.w - PLOT.right + 8" :y="band.mid">
          {{ band.tier }}
        </text>
      </g>
      <!-- constant-RICE guides -->
      <g v-for="g in scatter.guides" :key="g.rice">
        <line class="insights-scatter-guide" :x1="g.x1" :y1="g.y1" :x2="g.x2" :y2="g.y2" />
        <text class="insights-scatter-guide-label" :x="g.x2 + 4" :y="g.y2 - 4">
          RICE {{ g.rice }}
        </text>
      </g>
      <!-- axes -->
      <line
        class="insights-scatter-axis"
        :x1="PLOT.left"
        :x2="PLOT.w - PLOT.right"
        :y1="scatter.y0"
        :y2="scatter.y0"
      />
      <g v-for="t in scatter.xTicks" :key="`x${t.v}`">
        <text class="insights-scatter-tick" :x="t.x" :y="scatter.y0 + 16" text-anchor="middle">
          {{ t.v }}
        </text>
      </g>
      <g v-for="t in scatter.yTicks" :key="`y${t.v}`">
        <text class="insights-scatter-tick" :x="PLOT.left - 8" :y="t.y + 4" text-anchor="end">
          {{ t.v }}
        </text>
      </g>
      <text
        class="insights-scatter-tick"
        :x="(PLOT.left + PLOT.w - PLOT.right) / 2"
        :y="PLOT.h - 6"
        text-anchor="middle"
      >
        effort (story points, S13)
      </text>
      <text
        class="insights-scatter-tick"
        :transform="`rotate(-90 12 ${(PLOT.top + PLOT.h - PLOT.bottom) / 2})`"
        :x="12"
        :y="(PLOT.top + PLOT.h - PLOT.bottom) / 2"
        text-anchor="middle"
      >
        customer value (S16)
      </text>
      <!-- marks: 2px surface ring; merged tooltip lists every co-located spec -->
      <g v-for="m in scatter.marks" :key="m.ids.join()">
        <circle class="insights-scatter-dot" :cx="m.cx" :cy="m.cy" :r="m.ids.length > 1 ? 7 : 5">
          <title>{{ markTip(m) }}</title>
        </circle>
        <text v-if="m.label" class="insights-scatter-label" :x="m.cx + 10" :y="m.cy + 4">
          {{ m.label }}
        </text>
      </g>
    </svg>

    <div class="insights-dist-grid">
      <div>
        <h3>Value tiers</h3>
        <div class="insights-dist">
          <div v-for="row in tierBars.rows" :key="row.label" class="insights-dist-row">
            <span class="insights-tier" :data-tier="row.label">{{ row.label }}</span>
            <span class="insights-dist-track">
              <span
                class="insights-dist-bar"
                :style="{ width: `${(row.count / tierBars.max) * 100}%` }"
              />
            </span>
            <span class="insights-dist-count">{{ row.count }}</span>
          </div>
        </div>
      </div>
      <div>
        <h3>Effort spread</h3>
        <div class="insights-dist">
          <div v-for="row in sizeBars.rows" :key="row.label" class="insights-dist-row">
            <span class="insights-tier">{{ row.label }}</span>
            <span class="insights-dist-track">
              <span
                class="insights-dist-bar"
                :style="{ width: `${(row.count / sizeBars.max) * 100}%` }"
              />
            </span>
            <span class="insights-dist-count">{{ row.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.insights-note {
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.insights-note-warn {
  padding: 10px 14px;
  border-left: 3px solid var(--vp-c-warning-1);
  border-radius: 4px;
  background-color: var(--vp-c-warning-soft);
}
.insights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 16px 0 24px;
}
.insights-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background-color: var(--vp-c-bg-soft);
}
.insights-kpi-advisory {
  border-style: dashed;
}
.insights-kpi-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--vp-c-text-1);
}
.insights-kpi-value small {
  font-size: 16px;
  color: var(--vp-c-text-2);
}
.insights-kpi-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.insights-kpi-sub {
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.insights-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.insights-tier {
  padding: 1px 8px;
  border-radius: 10px;
  background-color: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 12px;
}
.insights-tier[data-tier='Critical'] {
  background-color: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}
.insights-tier[data-tier='High'] {
  background-color: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
}
.insights-divider {
  margin: 32px 0 0;
}

/* ---- status stacked bars (S10-SR-17) ----------------------------------
   Fill hues match SpecStatusBadge; dark mode steps down to the -2 shades so
   fills stay in the dark lightness band (the -1 shades are text colors). */
.insights {
  --chart-implemented: var(--vp-c-green-1);
  --chart-manual: var(--vp-c-indigo-1);
  --chart-planned: var(--vp-c-yellow-2);
  --chart-untracked: var(--vp-c-red-1);
  --chart-deferred: var(--vp-c-text-3);
}
.dark .insights {
  --chart-implemented: var(--vp-c-green-2);
  --chart-manual: var(--vp-c-indigo-2);
  --chart-planned: var(--vp-c-yellow-2);
  --chart-untracked: var(--vp-c-red-2);
  --chart-deferred: var(--vp-c-text-3);
}
.insights-status-chart {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 12px 0 8px;
}
.insights-status-row {
  display: grid;
  grid-template-columns: 3.2em 1fr 2.5em;
  gap: 8px;
  align-items: center;
}
.insights-status-id {
  font-size: 12px;
  text-align: right;
  font-weight: 500;
}
.insights-status-track {
  display: flex;
  gap: 2px;
}
.insights-seg {
  height: 12px;
  background-color: var(--vp-c-default-soft);
}
.insights-seg:last-child {
  border-radius: 0 4px 4px 0;
}
.insights-seg[data-status='implemented'] {
  background-color: var(--chart-implemented);
}
.insights-seg[data-status='manual'] {
  background-color: var(--chart-manual);
}
.insights-seg[data-status='planned'] {
  background-color: var(--chart-planned);
}
.insights-seg[data-status='untracked'] {
  background-color: var(--chart-untracked);
}
.insights-seg[data-status='deferred'] {
  background-color: var(--chart-deferred);
}
.insights-status-total {
  font-size: 11px;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}

/* ---- value-vs-effort scatter (S10-SR-17) ------------------------------ */
.insights-scatter {
  width: 100%;
  height: auto;
  margin: 8px 0 16px;
}
.insights-scatter-grid {
  stroke: var(--vp-c-divider);
  stroke-width: 1;
}
.insights-scatter-axis {
  stroke: var(--vp-c-text-3);
  stroke-width: 1;
}
.insights-scatter-guide {
  stroke: var(--vp-c-divider);
  stroke-width: 1;
}
.insights-scatter-band {
  fill: var(--vp-c-text-3);
  font-size: 11px;
}
.insights-scatter-guide-label,
.insights-scatter-tick {
  fill: var(--vp-c-text-3);
  font-size: 11px;
}
.insights-scatter-dot {
  fill: var(--vp-c-brand-1);
  stroke: var(--vp-c-bg);
  stroke-width: 2;
}
.insights-scatter-label {
  fill: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 600;
}

/* ---- distribution bars (S10-SR-17) ------------------------------------ */
.insights-dist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0 32px;
}
.insights-dist {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 16px;
}
.insights-dist-row {
  display: grid;
  grid-template-columns: 6em 1fr 2em;
  gap: 8px;
  align-items: center;
}
.insights-dist-row .insights-tier {
  text-align: center;
}
.insights-dist-track {
  display: block;
}
.insights-dist-bar {
  display: block;
  height: 12px;
  border-radius: 0 4px 4px 0;
  background-color: var(--vp-c-brand-1);
  opacity: 0.65;
}
.insights-dist-count {
  font-size: 12px;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
</style>
