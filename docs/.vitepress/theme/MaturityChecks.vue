<script setup lang="ts">
// Criteria breakdown for one scoring dimension (S12-SR-06): every check with
// its weight, earned points, the fact it reads, and the justification for the
// weight — under a stable per-check anchor (S12-SR-07). Skipped checks stay
// listed, marked as not counted (S12-SR-08). All values come from the
// build-time loader (S12-NFR-01); the dimension is picked via the dynamic
// route's `dimension` param.
import { computed } from 'vue'
import { useData } from 'vitepress'
import { data } from '../maturity.data'
import { REPO_BLOB_URL } from './repo'

const { params } = useData()
const dim = computed(() => data.dimensions.find((d) => d.slug === params.value?.dimension))
</script>

<template>
  <div v-if="dim" class="maturity-checks">
    <p class="maturity-checks-summary">
      <span class="maturity-checks-score"
        >{{ dim.score.toFixed(1) }}<small> / {{ data.scale }}</small></span
      >
      <span class="maturity-checks-earned"
        >{{ dim.earned }} of {{ dim.possible }} weighted points earned — snapshot of
        {{ data.generatedAt }}</span
      >
    </p>

    <section v-for="check in dim.checks" :key="check.id" :id="check.id" class="maturity-check">
      <h3 class="maturity-check-title">
        <code>{{ check.id }}</code>
        <span class="maturity-check-weight">weight {{ check.points }} pt{{ check.points === 1 ? '' : 's' }}</span>
        <span v-if="check.skipped" class="maturity-check-skipped"
          >not counted in this snapshot</span
        >
        <span v-else class="maturity-check-earned"
          >earned {{ check.earned }} / {{ check.points }}</span
        >
        <a class="header-anchor" :href="`#${check.id}`" :aria-label="`Permalink to ${check.id}`"
          >&ZeroWidthSpace;</a
        >
      </h3>
      <span v-if="!check.skipped" class="maturity-check-bar" aria-hidden="true">
        <span
          class="maturity-check-fill"
          :style="{ width: `${((check.earned ?? 0) / check.points) * 100}%` }"
        />
      </span>
      <p class="maturity-check-note"><strong>Measures:</strong> {{ check.note }}</p>
      <p class="maturity-check-why"><strong>Why this weight:</strong> {{ check.why }}</p>
    </section>

    <p class="maturity-checks-footer">
      Checks and weights are defined in
      <a :href="`${REPO_BLOB_URL}/scripts/maturity-score.mjs`" target="_blank" rel="noreferrer"
        ><code>scripts/maturity-score.mjs</code></a
      >
      — the single source of truth this page is generated from.
    </p>
  </div>
</template>

<style scoped>
.maturity-checks-summary {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}
.maturity-checks-score {
  font-size: 40px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  line-height: 1;
}
.maturity-checks-score small {
  font-size: 16px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.maturity-checks-earned {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.maturity-check {
  margin: 24px 0;
  padding: 16px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}
.maturity-check-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0;
  padding: 0;
  border: none;
  font-size: 15px;
  letter-spacing: normal;
}
.maturity-check-weight,
.maturity-check-earned,
.maturity-check-skipped {
  font-size: 12px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 10px;
}
.maturity-check-weight {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.maturity-check-earned {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
}
.maturity-check-skipped {
  background: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-1);
}
.maturity-check-bar {
  display: block;
  height: 6px;
  margin-top: 10px;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}
.maturity-check-fill {
  display: block;
  height: 100%;
  border-radius: 0 4px 4px 0;
  background: var(--vp-c-brand-1);
}
.maturity-check-note,
.maturity-check-why {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.6;
}
.maturity-check-note {
  color: var(--vp-c-text-2);
}
.maturity-checks-footer {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
