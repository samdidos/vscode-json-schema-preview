<script setup lang="ts">
// Corpus-level KPIs for the spec set (S10-SR-12/13). Every figure is derived
// at build time from specs/ — nothing here is hand-maintained.
//
// The page is deliberately split in two (S10-SR-13): counted facts first
// (requirements, statuses, tag and documentation coverage), then advisory
// estimates behind a clear divider. Effort and value are judgements, and
// putting them in the same block as the counts would lend them an authority
// they have not earned.
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as specsData } from '../specs.data'
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
const maxRice = computed(() => byRice.value[0]?.metrics.rice ?? 1)
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
        v-for="(count, status) in totals.counts"
        :key="status"
        :status="status as string"
        :count="count"
      />
    </p>

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

    <h3>Value tiers</h3>
    <p class="insights-badges">
      <span v-for="tier in value.tiers" :key="tier" class="insights-tier" :data-tier="tier">
        {{ tier }} <strong>{{ value.byTier[tier] }}</strong>
      </span>
    </p>

    <h3>Effort spread</h3>
    <p class="insights-badges">
      <span v-for="(n, size) in effort.bySize" :key="size" class="insights-tier">
        {{ size }} <strong>{{ n }}</strong>
      </span>
    </p>

    <h3>Feature specs ranked by RICE</h3>
    <p class="insights-note">
      Value divided by effort points. For features already built this is a
      relative sizing aid for future work, not a verdict on what has shipped.
    </p>
    <div class="insights-table-wrapper">
      <table class="insights-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Spec</th>
            <th>Title</th>
            <th>Value</th>
            <th>Effort</th>
            <th>RICE</th>
            <th class="insights-bar-head"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(spec, i) in byRice" :key="spec.id">
            <td class="insights-rank">{{ i + 1 }}</td>
            <td><a :href="withBase(`/specs/${spec.id}`)">{{ spec.id }}</a></td>
            <td>{{ spec.title }}</td>
            <td class="insights-num">
              {{ spec.metrics.value?.toFixed(1) }}
              <span class="insights-tier" :data-tier="spec.metrics.tier">{{ spec.metrics.tier }}</span>
            </td>
            <td class="insights-num">{{ spec.metrics.points }} pts</td>
            <td class="insights-num"><strong>{{ spec.metrics.rice?.toFixed(2) }}</strong></td>
            <td class="insights-bar-cell">
              <span
                class="insights-bar"
                :style="{ width: `${((spec.metrics.rice ?? 0) / maxRice) * 100}%` }"
              />
            </td>
          </tr>
        </tbody>
      </table>
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
  font-variant-numeric: tabular-nums;
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
.insights-table-wrapper {
  overflow-x: auto;
}
.insights-table {
  width: 100%;
  display: table;
}
.insights-num {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.insights-rank {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}
.insights-bar-head {
  width: 22%;
}
.insights-bar-cell {
  min-width: 80px;
}
.insights-bar {
  display: block;
  height: 8px;
  border-radius: 4px;
  background-color: var(--vp-c-brand-1);
  opacity: 0.65;
}
</style>
