<script setup lang="ts">
// Maturity evolution over time (S12-SR-11): an inline-SVG line chart of every
// history snapshot — no chart library (S12-NFR-02), themed via VitePress CSS
// variables (S12-NFR-03). The overall score is the emphasized series; each
// dimension is a context line until its legend entry (a link to the
// dimension's criteria page) is hovered or focused. A crosshair snapped to
// the nearest snapshot reads out every series' value; the same data is
// reachable as a table below (S12-SR-12).
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { data as history } from '../maturityHistory.data'

const W = 760
const H = 340
const M = { top: 14, right: 18, bottom: 30, left: 34 }
const IW = W - M.left - M.right
const IH = H - M.top - M.bottom

const snaps = history
const enough = snaps.length >= 2
const scale = computed(() => snaps[snaps.length - 1]?.scale ?? 5)
// Dimension identity comes from the newest snapshot (labels are stable across
// the recorded history; a renamed dimension would start a new series).
const dims = computed(() => snaps[snaps.length - 1]?.dimensions ?? [])

const t0 = computed(() => Date.parse(snaps[0]?.at ?? '0'))
const t1 = computed(() => Date.parse(snaps[snaps.length - 1]?.at ?? '0'))
const xs = computed(() =>
  snaps.map((s) => {
    const span = t1.value - t0.value || 1
    return M.left + ((Date.parse(s.at) - t0.value) / span) * IW
  }),
)

// Y domain: half-point floor just under the lowest recorded score, up to the
// scale top — the axis is labelled, so the zoom is explicit, not implied.
const yMin = computed(() => {
  const min = Math.min(...snaps.flatMap((s) => [s.overall, ...s.dimensions.map((d) => d.score)]))
  return Math.max(0, Math.floor((min - 0.1) * 2) / 2)
})
const y = (v: number) => M.top + (1 - (v - yMin.value) / (scale.value - yMin.value)) * IH
const yTicks = computed(() => {
  const out: number[] = []
  for (let v = yMin.value; v <= scale.value + 1e-9; v += 0.5) out.push(Math.round(v * 10) / 10)
  return out
})
// One x tick per distinct date, thinned to at most six.
const xTicks = computed(() => {
  const byDate = new Map<string, number>()
  snaps.forEach((s, i) => { const d = s.at.slice(0, 10); if (!byDate.has(d)) byDate.set(d, i) })
  const all = [...byDate.entries()]
  const step = Math.ceil(all.length / 6)
  return all.filter((_, i) => i % step === 0).map(([date, i]) => ({ date, x: xs.value[i] }))
})

function valueOf(s: (typeof snaps)[number], key: string): number {
  return key === 'overall' ? s.overall : (s.dimensions.find((d) => d.slug === key)?.score ?? NaN)
}
const seriesKeys = computed(() => ['overall', ...dims.value.map((d) => d.slug)])
function pointsFor(key: string): string {
  return snaps.map((s, i) => `${xs.value[i]},${y(valueOf(s, key))}`).join(' ')
}

// Emphasis: overall carries the accent until a legend entry hovers/focuses a
// dimension — then the roles swap (color follows the chosen entity).
const highlighted = ref<string | null>(null)
const isAccent = (key: string) =>
  highlighted.value === key || (highlighted.value === null && key === 'overall')

// Crosshair snapped to the nearest snapshot (readers aim at a date, not a 2px
// line); for batch snapshots sharing one x, the last (newest) wins.
const hoverIdx = ref<number | null>(null)
function onMove(evt: MouseEvent) {
  const svg = evt.currentTarget as SVGSVGElement
  const px = ((evt.clientX - svg.getBoundingClientRect().left) / svg.clientWidth) * W
  let best = 0
  xs.value.forEach((x, i) => { if (Math.abs(x - px) <= Math.abs(xs.value[best] - px)) best = i })
  hoverIdx.value = best
}
const hovered = computed(() => (hoverIdx.value === null ? null : snaps[hoverIdx.value]))
</script>

<template>
  <figure v-if="enough" class="maturity-evolution">
    <!-- legend: one row above the chart; dimension entries link to their page -->
    <div class="evo-legend">
      <span
        class="evo-chip"
        :class="{ 'is-accent': isAccent('overall') }"
        tabindex="0"
        @mouseenter="highlighted = null"
        @focus="highlighted = null"
      >
        <span class="evo-chip-key" aria-hidden="true" />Overall
      </span>
      <a
        v-for="d in dims"
        :key="d.slug"
        class="evo-chip"
        :class="{ 'is-accent': isAccent(d.slug) }"
        :href="withBase(`/maturity/${d.slug}`)"
        :aria-label="`${d.label} — highlight its history line; open the criteria page.`"
        @mouseenter="highlighted = d.slug"
        @mouseleave="highlighted = null"
        @focus="highlighted = d.slug"
        @blur="highlighted = null"
      >
        <span class="evo-chip-key" aria-hidden="true" />{{ d.label }}
      </a>
    </div>

    <div class="evo-frame">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="`Line chart of the overall maturity score and each dimension across ${snaps.length} recorded score changes. The same values follow as a table.`"
        @mousemove="onMove"
        @mouseleave="hoverIdx = null"
      >
        <g class="evo-grid" aria-hidden="true">
          <template v-for="t in yTicks" :key="t">
            <line :x1="M.left" :x2="W - M.right" :y1="y(t)" :y2="y(t)" />
            <text class="evo-tick" :x="M.left - 6" :y="y(t) + 4" text-anchor="end">
              {{ t.toFixed(1) }}
            </text>
          </template>
          <text
            v-for="t in xTicks"
            :key="t.date"
            class="evo-tick"
            :x="t.x"
            :y="H - M.bottom + 18"
            text-anchor="middle"
          >
            {{ t.date }}
          </text>
        </g>

        <polyline
          v-for="key in seriesKeys"
          :key="key"
          class="evo-line"
          :class="{ 'is-accent': isAccent(key), 'is-dimmed': highlighted !== null && !isAccent(key) }"
          :points="pointsFor(key)"
          aria-hidden="true"
        />
        <!-- dots on the accent series only (selective, not every series) -->
        <g v-for="key in seriesKeys" :key="`dots-${key}`" aria-hidden="true">
          <template v-if="isAccent(key)">
            <circle v-for="(s, i) in snaps" :key="s.at + i" class="evo-dot" :cx="xs[i]" :cy="y(valueOf(s, key))" r="3.5" />
          </template>
        </g>

        <!-- crosshair -->
        <g v-if="hoverIdx !== null" aria-hidden="true">
          <line class="evo-crosshair" :x1="xs[hoverIdx]" :x2="xs[hoverIdx]" :y1="M.top" :y2="H - M.bottom" />
        </g>
      </svg>

      <div
        v-if="hovered && hoverIdx !== null"
        class="evo-tooltip"
        :class="{ 'is-left': xs[hoverIdx] > W * 0.62 }"
        :style="{ left: `${(xs[hoverIdx] / W) * 100}%` }"
        aria-hidden="true"
      >
        <span class="evo-tooltip-date">{{ hovered.at.slice(0, 10) }}<template v-if="hovered.commit"> · {{ hovered.commit }}</template></span>
        <span class="evo-tooltip-row is-overall">
          <span class="evo-tooltip-value">{{ hovered.overall.toFixed(1) }}</span> Overall
        </span>
        <span v-for="d in hovered.dimensions" :key="d.slug" class="evo-tooltip-row">
          <span class="evo-tooltip-value">{{ d.score.toFixed(1) }}</span> {{ d.label }}
        </span>
      </div>
    </div>

    <!-- text equivalent (S12-SR-12) -->
    <details class="evo-table">
      <summary>All recorded score changes as a table</summary>
      <div class="evo-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Overall</th>
              <th v-for="d in dims" :key="d.slug">
                <a :href="withBase(`/maturity/${d.slug}`)">{{ d.label }}</a>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in snaps" :key="s.at + i">
              <td>{{ s.at.slice(0, 10) }}<template v-if="s.commit"> · <code>{{ s.commit }}</code></template></td>
              <td class="evo-num">{{ s.overall.toFixed(1) }}</td>
              <td v-for="d in dims" :key="d.slug" class="evo-num">
                {{ valueOf(s, d.slug).toFixed(1) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </figure>
  <p v-else class="evo-empty">
    Not enough history yet — score changes appear here once
    <code>maturity-history/</code> holds at least two snapshots.
  </p>
</template>

<style scoped>
.maturity-evolution {
  margin: 24px 0 8px;
}
.evo-frame {
  position: relative;
  max-width: 760px;
}
.evo-frame svg {
  display: block;
  width: 100%;
  height: auto;
}

.evo-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-bottom: 10px;
}
.evo-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  cursor: pointer;
}
.evo-chip-key {
  width: 14px;
  height: 0;
  border-top: 2px solid var(--vp-c-text-3);
}
.evo-chip.is-accent {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.evo-chip.is-accent .evo-chip-key {
  border-top-color: var(--vp-c-brand-1);
  border-top-width: 3px;
}

.evo-grid line {
  stroke: var(--vp-c-divider);
  stroke-opacity: 0.6;
}
.evo-tick {
  fill: var(--vp-c-text-3);
  font-size: 11px;
}

.evo-line {
  fill: none;
  stroke: var(--vp-c-text-3);
  stroke-opacity: 0.45;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: stroke-opacity 0.12s ease;
}
.evo-line.is-accent {
  stroke: var(--vp-c-brand-1);
  stroke-opacity: 1;
  stroke-width: 2.5;
}
.evo-line.is-dimmed {
  stroke-opacity: 0.18;
}
.evo-dot {
  fill: var(--vp-c-brand-1);
  stroke: var(--vp-c-bg);
  stroke-width: 1.5;
}
.evo-crosshair {
  stroke: var(--vp-c-text-2);
  stroke-dasharray: 3 3;
}

.evo-tooltip {
  position: absolute;
  top: 8px;
  transform: translateX(10px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-2);
  pointer-events: none;
  white-space: nowrap;
  z-index: 10;
}
.evo-tooltip.is-left {
  transform: translateX(calc(-100% - 10px));
}
.evo-tooltip-date {
  font-size: 11px;
  color: var(--vp-c-text-3);
  margin-bottom: 2px;
}
.evo-tooltip-row {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.evo-tooltip-row.is-overall {
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.evo-tooltip-value {
  display: inline-block;
  min-width: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.evo-table {
  margin-top: 12px;
  font-size: 13px;
}
.evo-table summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
}
.evo-table-wrapper {
  overflow-x: auto;
}
.evo-table table {
  display: table;
  width: 100%;
  margin: 8px 0 0;
}
.evo-num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.evo-empty {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
@media (prefers-reduced-motion: reduce) {
  .evo-line {
    transition: none;
  }
}
</style>
