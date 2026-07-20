<script setup lang="ts">
// Delivery view (S14-SR-07): the four DORA metrics as labelled tiles with
// their performance bands, a per-release lead-time trend, and a per-release
// table — all from the committed dora.json (no recomputation). Theme-aware
// inline SVG, no chart library.
import { computed } from 'vue'
import { data } from '../dora.data'

const m = data.metrics

const tiles = computed(() => [
  {
    key: 'df',
    label: 'Deployment frequency',
    value: m.deploymentFrequency.perWeek !== null ? `${m.deploymentFrequency.perWeek}` : '—',
    unit: '/ week',
    sub: m.deploymentFrequency.medianIntervalDays !== null
      ? `median ${m.deploymentFrequency.medianIntervalDays} d between releases`
      : '',
    band: m.deploymentFrequency.band,
  },
  {
    key: 'lt',
    label: 'Lead time for changes',
    value: m.leadTimeForChanges.medianDays !== null ? `${m.leadTimeForChanges.medianDays}` : '—',
    unit: 'days',
    sub: 'commit → released, median',
    band: m.leadTimeForChanges.band,
  },
  {
    key: 'cfr',
    label: 'Change failure rate',
    value: m.changeFailureRate.percent !== null ? `${m.changeFailureRate.percent}` : '—',
    unit: '%',
    sub: `${m.changeFailureRate.failures} of ${m.changeFailureRate.of} releases needed a patch`,
    band: m.changeFailureRate.band,
  },
  {
    key: 'ttr',
    label: 'Time to restore',
    value: m.timeToRestore.medianDays !== null ? `${m.timeToRestore.medianDays}` : 'n/a',
    unit: m.timeToRestore.medianDays !== null ? 'days' : '',
    sub: m.timeToRestore.failures > 0 ? `median over ${m.timeToRestore.failures} hotfixes` : 'no failures recorded',
    band: m.timeToRestore.band,
  },
])

function bandClass(band: string): string {
  return `band-${band.toLowerCase().replace(/[^a-z]/g, '')}`
}

// Lead-time trend: releases with a lead time (excludes the seed release).
const W = 760
const H = 240
const PAD = { top: 16, right: 16, bottom: 28, left: 34 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom
const points = computed(() => data.perRelease.filter((r) => r.leadTimeDays !== null))
const maxLead = computed(() => Math.max(1, ...points.value.map((r) => r.leadTimeDays as number)))
const xs = computed(() =>
  points.value.map((_, i) =>
    points.value.length <= 1 ? PAD.left + IW / 2 : PAD.left + (i / (points.value.length - 1)) * IW,
  ),
)
const y = (v: number) => PAD.top + (1 - v / maxLead.value) * IH
const linePath = computed(() =>
  points.value.map((r, i) => `${xs.value[i]},${y(r.leadTimeDays as number)}`).join(' '),
)
const yTicks = computed(() => {
  const step = maxLead.value <= 4 ? 1 : Math.ceil(maxLead.value / 4)
  const out: number[] = []
  for (let v = 0; v <= maxLead.value + 1e-9; v += step) out.push(v)
  return out
})
</script>

<template>
  <div class="dora">
    <div class="dora-tiles">
      <div v-for="t in tiles" :key="t.key" class="dora-tile">
        <span class="dora-tile-label">{{ t.label }}</span>
        <span class="dora-tile-value">{{ t.value }}<small> {{ t.unit }}</small></span>
        <span class="dora-tile-sub">{{ t.sub }}</span>
        <span class="dora-band" :class="bandClass(t.band)">{{ t.band }}</span>
      </div>
    </div>

    <h2 id="lead-time-per-release">
      Lead time per release
      <a class="header-anchor" href="#lead-time-per-release" aria-label='Permalink'>&ZeroWidthSpace;</a>
    </h2>
    <figure class="dora-trend">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img"
        :aria-label="`Lead time in days for each of ${points.length} releases; the table below lists every value.`">
        <g class="dora-grid" aria-hidden="true">
          <template v-for="t in yTicks" :key="t">
            <line :x1="PAD.left" :x2="W - PAD.right" :y1="y(t)" :y2="y(t)" />
            <text class="dora-tick" :x="PAD.left - 6" :y="y(t) + 4" text-anchor="end">{{ t }}</text>
          </template>
        </g>
        <polyline class="dora-line" :points="linePath" aria-hidden="true" />
        <g aria-hidden="true">
          <circle v-for="(r, i) in points" :key="r.tag" class="dora-dot"
            :class="{ 'is-failure': r.failure }" :cx="xs[i]" :cy="y(r.leadTimeDays as number)" r="3.5">
            <title>{{ r.tag }} — {{ r.leadTimeDays }} d lead{{ r.failure ? ' · failure (hotfix followed)' : '' }}</title>
          </circle>
        </g>
      </svg>
      <figcaption>Days from a change's authoring to the release that shipped it. Dots in the accent colour are releases that a hotfix patch followed.</figcaption>
    </figure>

    <details class="dora-table">
      <summary>All {{ data.releaseCount }} releases</summary>
      <div class="dora-table-wrap">
        <table>
          <thead>
            <tr><th>Release</th><th>Date</th><th>Commits</th><th>Interval (d)</th><th>Lead time (d)</th><th>Followed by hotfix</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in data.perRelease" :key="r.tag">
              <td><code>{{ r.tag }}</code></td>
              <td>{{ r.date }}</td>
              <td class="num">{{ r.commits }}</td>
              <td class="num">{{ r.intervalDays ?? '—' }}</td>
              <td class="num">{{ r.leadTimeDays ?? '—' }}</td>
              <td>{{ r.failure ? `yes · restored in ${r.restoreDays} d` : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
.dora-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 24px 0;
}
.dora-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}
.dora-tile-label {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.dora-tile-value {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--vp-c-text-1);
}
.dora-tile-value small {
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.dora-tile-sub {
  font-size: 11px;
  color: var(--vp-c-text-3);
}
.dora-band {
  align-self: flex-start;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
}
.band-elite {
  background: var(--vp-c-green-soft);
  color: var(--vp-c-green-1);
}
.band-high {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.band-medium {
  background: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-1);
}
.band-low {
  background: var(--vp-c-red-soft);
  color: var(--vp-c-red-1);
}
.band-na {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-3);
}

.dora-trend svg {
  display: block;
  width: 100%;
  height: auto;
  max-width: 760px;
}
.dora-grid line {
  stroke: var(--vp-c-divider);
  stroke-opacity: 0.6;
}
.dora-tick {
  fill: var(--vp-c-text-3);
  font-size: 11px;
}
.dora-line {
  fill: none;
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
  stroke-linejoin: round;
}
.dora-dot {
  fill: var(--vp-c-text-3);
  stroke: var(--vp-c-bg);
  stroke-width: 1.5;
}
.dora-dot.is-failure {
  fill: var(--vp-c-brand-1);
}
.dora-trend figcaption {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-top: 6px;
}
.dora-table {
  margin-top: 16px;
  font-size: 13px;
}
.dora-table summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
}
.dora-table-wrap {
  overflow-x: auto;
}
.dora-table table {
  display: table;
  width: 100%;
  margin-top: 8px;
}
.dora-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
