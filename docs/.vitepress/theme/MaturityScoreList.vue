<script setup lang="ts">
// Text equivalent of the radar (S12-SR-05): every dimension score as a plain
// linked list with a thin magnitude bar — the same data, reachable without a
// pointer and legible to screen readers. Values come from the build-time
// loader only (S12-NFR-01).
import { withBase } from 'vitepress'
import { data } from '../maturity.data'
</script>

<template>
  <ul class="maturity-scores">
    <li v-for="d in data.dimensions" :key="d.slug" class="maturity-scores-row">
      <a class="maturity-scores-label" :href="withBase(`/maturity/${d.slug}`)">{{ d.label }}</a>
      <span class="maturity-scores-bar" aria-hidden="true">
        <span
          class="maturity-scores-fill"
          :style="{ width: `${(d.score / data.scale) * 100}%` }"
        />
      </span>
      <span class="maturity-scores-value">
        {{ d.score.toFixed(1) }}<span class="maturity-scores-max"> / {{ data.scale }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.maturity-scores {
  list-style: none;
  margin: 16px 0;
  padding: 0;
}
.maturity-scores-row {
  display: grid;
  grid-template-columns: minmax(150px, 220px) 1fr 64px;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 6px 0;
}
.maturity-scores-row + .maturity-scores-row {
  margin-top: 2px;
}
.maturity-scores-label {
  font-size: 14px;
  font-weight: 500;
}
.maturity-scores-bar {
  display: block;
  height: 10px;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}
.maturity-scores-fill {
  display: block;
  height: 100%;
  border-radius: 0 4px 4px 0;
  background: var(--vp-c-brand-1);
}
.maturity-scores-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--vp-c-text-1);
}
.maturity-scores-max {
  font-weight: 400;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
@media (max-width: 480px) {
  .maturity-scores-row {
    grid-template-columns: 1fr 56px;
  }
  .maturity-scores-bar {
    display: none;
  }
}
</style>
