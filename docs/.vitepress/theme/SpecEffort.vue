<script setup lang="ts">
// Advisory effort estimate on each spec page (S13-SR-05): points, T-shirt,
// hour band, factors, and justification — visibly labelled as an estimate
// with provenance, never mixed into the maturity score (S13-NFR-01).
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { data } from '../specEffort.data'

const { params } = useData()
const est = computed(() => (params.value?.id ? data.specs[params.value.id] : undefined))
const hours = computed(() => {
  if (!est.value) return ''
  return est.value.hoursMax === null
    ? `${est.value.hoursMin} h+`
    : `${est.value.hoursMin}–${est.value.hoursMax} h`
})
</script>

<template>
  <aside v-if="est" class="spec-effort" aria-label="Advisory effort estimate">
    <span class="spec-effort-badge">estimate</span>
    <span class="spec-effort-points">{{ est.points }}<small> pts</small></span>
    <span class="spec-effort-part">{{ est.tshirt }}</span>
    <span class="spec-effort-part">{{ hours }}</span>
    <span v-if="est.factors.length" class="spec-effort-factors">
      <code v-for="f in est.factors" :key="f">{{ f }}</code>
    </span>
    <span class="spec-effort-why">{{ est.justification }}</span>
    <span class="spec-effort-meta">
      Advisory only — estimated by {{ est.estimator }} on {{ est.estimatedAt }} from the
      implementation ({{ est.evidence.implLoc }} LOC across {{ est.evidence.implFiles }} files);
      not part of the maturity score. Rubric:
      <a :href="withBase('/specs/S13')">S13</a>.
    </span>
  </aside>
</template>

<style scoped>
.spec-effort {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin: 20px 0;
  padding: 12px 16px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 10px;
  font-size: 13px;
}
.spec-effort-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-1);
}
.spec-effort-points {
  font-size: 20px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.spec-effort-points small {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.spec-effort-part {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.spec-effort-factors code {
  margin-right: 4px;
  font-size: 11px;
}
.spec-effort-why {
  flex-basis: 100%;
  color: var(--vp-c-text-2);
}
.spec-effort-meta {
  flex-basis: 100%;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
</style>
