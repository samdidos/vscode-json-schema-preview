<script setup lang="ts">
// Advisory customer-value estimate on each feature spec page (S16-SR-07):
// score, tier, the three dimensions, factors and justification — visibly
// labelled as a judgement with provenance, never mixed into the maturity
// score (S16-NFR-01). System spec pages render nothing (S16-SR-06).
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { data } from '../specValue.data'

const REACH_LABEL: Record<number, string> = {
  1: 'under 5% of users', 2: '5–20% of users', 3: '20–50% of users',
  4: '50–80% of users', 5: 'over 80% of users',
}
const IMPACT_LABEL: Record<number, string> = {
  1: 'minor convenience', 2: 'saves minutes', 3: 'saves real time',
  4: 'removes a manual workflow', 5: 'a reason to install',
}
const CONFIDENCE_LABEL: Record<number, string> = {
  1: 'stated purpose', 0.8: 'domain-reasoned', 0.5: 'speculative',
}

const { params } = useData()
const est = computed(() => (params.value?.id ? data.features[params.value.id] : undefined))
</script>

<template>
  <aside v-if="est" class="spec-value" aria-label="Advisory customer-value estimate">
    <span class="spec-value-badge">value</span>
    <span class="spec-value-score">{{ est.score.toFixed(1) }}<small> value</small></span>
    <span class="spec-value-tier" :data-tier="est.tier">{{ est.tier }}</span>
    <span v-if="est.rice" class="spec-value-part">RICE {{ est.rice.toFixed(2) }}</span>
    <span v-if="est.factors.length" class="spec-value-factors">
      <code v-for="f in est.factors" :key="f">{{ f }}</code>
    </span>
    <span class="spec-value-dims">
      reach <strong>{{ est.reach }}</strong> ({{ REACH_LABEL[est.reach] }}) ·
      impact <strong>{{ est.impact }}</strong> ({{ IMPACT_LABEL[est.impact] }}) ·
      confidence <strong>{{ est.confidence.toFixed(1) }}</strong> ({{ CONFIDENCE_LABEL[est.confidence] }})
    </span>
    <span class="spec-value-why">{{ est.justification }}</span>
    <span class="spec-value-meta">
      Advisory only — a judgement about worth, not a measurement, estimated by
      {{ est.estimator }} on {{ est.estimatedAt }}; not part of the maturity score.
      <template v-if="est.rice">
        RICE divides this score by the
        <a :href="withBase('/specs/S13')">S13</a> effort estimate ({{ est.points }} pts).
      </template>
      Rubric: <a :href="withBase('/specs/S16')">S16</a>.
    </span>
  </aside>
</template>

<style scoped>
.spec-value {
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
.spec-value-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--vp-c-purple-soft);
  color: var(--vp-c-purple-1);
}
.spec-value-score {
  font-size: 20px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.spec-value-score small {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.spec-value-tier {
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}
.spec-value-tier[data-tier='Critical'] {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}
.spec-value-tier[data-tier='High'] {
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
}
.spec-value-part {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.spec-value-factors code {
  margin-right: 4px;
  font-size: 11px;
}
.spec-value-dims,
.spec-value-why {
  flex-basis: 100%;
  color: var(--vp-c-text-2);
}
.spec-value-meta {
  flex-basis: 100%;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
</style>
