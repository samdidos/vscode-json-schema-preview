<script setup lang="ts">
// Interactive radar of the dimension scores (S12-SR-04): inline SVG rendered
// by Vue — no chart library (S12-NFR-02) — themed via VitePress CSS variables
// (S12-NFR-03). Every axis is a real link: hover/focus reveals the exact
// score in a tooltip, activating it opens the dimension's criteria page. The
// accessible text equivalent lives in <MaturityScoreList /> (S12-SR-05).
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { data } from '../maturity.data'

// Fixed drawing frame; the SVG itself scales responsively via viewBox.
const W = 760
const H = 560
const CX = W / 2
const CY = H / 2 + 6
const R = 190 // radius of the score=scale ring
const LABEL_OFFSET = 26

const dims = computed(() => data.dimensions)
const n = computed(() => dims.value.length)

/** Polar → cartesian on the chart frame; axis 0 points straight up. */
function point(axis: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * axis) / n.value
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
}

function ringPoints(radius: number): string {
  return dims.value.map((_, i) => { const p = point(i, radius); return `${p.x},${p.y}` }).join(' ')
}

// Grid rings at each whole score tick (1..scale).
const ticks = computed(() => Array.from({ length: data.scale }, (_, i) => i + 1))

const axes = computed(() =>
  dims.value.map((d, i) => {
    const outer = point(i, R)
    const vertex = point(i, (R * d.score) / data.scale)
    const label = point(i, R + LABEL_OFFSET)
    // Generous hit area (bigger than the mark): the whole sector of this axis.
    // Fractional axis positions are fine — point() is periodic in `axis`.
    const a = point(i - 0.5, R + LABEL_OFFSET + 14)
    const b = point(i + 0.5, R + LABEL_OFFSET + 14)
    const sector = `M ${CX} ${CY} L ${a.x} ${a.y} L ${b.x} ${b.y} Z`
    const anchor = Math.abs(label.x - CX) < 1 ? 'middle' : label.x > CX ? 'start' : 'end'
    return { dim: d, outer, vertex, label, sector, anchor }
  }),
)

const valuePolygon = computed(() =>
  dims.value.map((d, i) => { const p = point(i, (R * d.score) / data.scale); return `${p.x},${p.y}` }).join(' '),
)

// Hover/focus state drives both the tooltip and the mark "lift".
const active = ref<string | null>(null)
const activeAxis = computed(() => axes.value.find((a) => a.dim.slug === active.value))
</script>

<template>
  <figure class="maturity-radar">
    <div class="maturity-radar-frame">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="`Radar chart of the ${n} maturity dimension scores out of ${data.scale}. The same scores follow as a list.`"
      >
        <!-- grid: recessive rings + axis spokes -->
        <g class="radar-grid" aria-hidden="true">
          <polygon
            v-for="t in ticks"
            :key="t"
            :points="ringPoints((R * t) / data.scale)"
            :class="{ 'radar-grid-outer': t === data.scale }"
          />
          <line
            v-for="a in axes"
            :key="a.dim.slug"
            :x1="CX"
            :y1="CY"
            :x2="a.outer.x"
            :y2="a.outer.y"
          />
          <text
            v-for="t in ticks"
            :key="`tick-${t}`"
            class="radar-tick"
            :x="CX + 7"
            :y="CY - (R * t) / data.scale + 4"
          >
            {{ t }}
          </text>
        </g>

        <!-- the score shape -->
        <polygon class="radar-value" :points="valuePolygon" aria-hidden="true" />

        <!-- one link per dimension: sector hit area + vertex dot + label -->
        <a
          v-for="a in axes"
          :key="a.dim.slug"
          class="radar-axis"
          :href="withBase(`/maturity/${a.dim.slug}`)"
          :aria-label="`${a.dim.label}: ${a.dim.score} out of ${data.scale}. Open the criteria page.`"
          :class="{ 'is-active': active === a.dim.slug }"
          @mouseenter="active = a.dim.slug"
          @mouseleave="active = null"
          @focus="active = a.dim.slug"
          @blur="active = null"
        >
          <path class="radar-hit" :d="a.sector" />
          <circle class="radar-dot" :cx="a.vertex.x" :cy="a.vertex.y" r="4.5" />
          <text class="radar-label" :x="a.label.x" :y="a.label.y" :text-anchor="a.anchor">
            <tspan class="radar-label-name" :x="a.label.x" dy="0">{{ a.dim.label }}</tspan>
            <tspan class="radar-label-score" :x="a.label.x" dy="17">{{ a.dim.score.toFixed(1) }}</tspan>
          </text>
        </a>
      </svg>

      <!-- tooltip (enhances, never gates: the list below repeats every value) -->
      <div
        v-if="activeAxis"
        class="radar-tooltip"
        :style="{
          left: `${(activeAxis.vertex.x / W) * 100}%`,
          top: `${(activeAxis.vertex.y / H) * 100}%`,
        }"
        aria-hidden="true"
      >
        <span class="radar-tooltip-value"
          >{{ activeAxis.dim.score.toFixed(1) }}<small> / {{ data.scale }}</small></span
        >
        <span class="radar-tooltip-label">{{ activeAxis.dim.label }}</span>
        <span class="radar-tooltip-detail"
          >{{ activeAxis.dim.earned }} of {{ activeAxis.dim.possible }} points — open criteria</span
        >
      </div>
    </div>
  </figure>
</template>

<style scoped>
.maturity-radar {
  margin: 24px 0 8px;
}
.maturity-radar-frame {
  position: relative;
  max-width: 760px;
  margin: 0 auto;
}
.maturity-radar svg {
  display: block;
  width: 100%;
  height: auto;
}

.radar-grid polygon {
  fill: none;
  stroke: var(--vp-c-divider);
  stroke-opacity: 0.6;
}
.radar-grid polygon.radar-grid-outer {
  stroke-opacity: 1;
}
.radar-grid line {
  stroke: var(--vp-c-divider);
  stroke-opacity: 0.6;
}
.radar-tick {
  fill: var(--vp-c-text-3);
  font-size: 11px;
}

.radar-value {
  fill: var(--vp-c-brand-1);
  fill-opacity: 0.14;
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
  stroke-linejoin: round;
}

.radar-axis {
  cursor: pointer;
  outline: none;
  /* The doc theme underlines content links; the hover/focus color shift and
     tooltip already signal interactivity here, so keep the labels clean. */
  text-decoration: none;
}
.radar-hit {
  fill: transparent;
  stroke: none;
}
.radar-dot {
  fill: var(--vp-c-brand-1);
  stroke: var(--vp-c-bg);
  stroke-width: 2;
  transition: r 0.12s ease;
}
.radar-axis.is-active .radar-dot {
  r: 6.5;
}
.radar-axis:focus-visible .radar-dot {
  stroke: var(--vp-c-text-1);
}
.radar-label {
  font-size: 14px;
}
.radar-label-name {
  fill: var(--vp-c-text-1);
  font-weight: 500;
}
.radar-axis.is-active .radar-label-name {
  fill: var(--vp-c-brand-1);
}
.radar-label-score {
  fill: var(--vp-c-text-2);
  font-size: 13px;
}

.radar-tooltip {
  position: absolute;
  transform: translate(-50%, -115%);
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-2);
  pointer-events: none;
  white-space: nowrap;
  z-index: 10;
}
.radar-tooltip-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.radar-tooltip-value small {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.radar-tooltip-label {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.radar-tooltip-detail {
  font-size: 11px;
  color: var(--vp-c-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .radar-dot {
    transition: none;
  }
}
</style>
