<script setup lang="ts">
// Per-spec documentation-coverage chart on the Docs dimension page
// (S12-SR-14): every documentable spec's tagged words against its
// complexity-derived expectation, least-covered first, linking each spec to
// its page. Rendered only on the "docs" dimension; other dimension pages get
// nothing from this component.
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { data } from '../docCoverage.data'

const { params } = useData()
const active = computed(() => params.value?.dimension === 'docs')
const specs = computed(() => [...data.specs].sort((a, b) => a.coverage - b.coverage))
const mean = computed(() =>
  data.specs.length ? data.specs.reduce((s, x) => s + x.coverage, 0) / data.specs.length : 0,
)
</script>

<template>
  <section v-if="active" class="doc-coverage">
    <h2 id="documentation-coverage-by-spec">
      Documentation coverage by spec
      <a
        class="header-anchor"
        href="#documentation-coverage-by-spec"
        aria-label='Permalink to "Documentation coverage by spec"'
        >&ZeroWidthSpace;</a
      >
    </h2>
    <p class="doc-coverage-intro">
      What the <code>doc-coverage</code> check above actually measures: for every spec, the words
      of documentation attributed to it via <code>&lt;!-- spec:… --&gt;</code> tags versus the
      words its complexity leads us to expect ({{ data.wordsPerRequirement }} ×&nbsp;its
      documentable requirements, floor {{ data.minExpectedWords }}). The check earns the
      <strong>mean coverage: {{ Math.round(mean * 100) }}%</strong>. Least-documented specs
      first — each is the next best place to write.
    </p>
    <ul class="doc-coverage-list">
      <li v-for="s in specs" :key="s.id" class="doc-coverage-row">
        <a class="doc-coverage-spec" :href="withBase(`/specs/${s.id}`)" :title="s.title">
          {{ s.id }} · {{ s.title }}
        </a>
        <span class="doc-coverage-bar" aria-hidden="true">
          <span class="doc-coverage-fill" :style="{ width: `${s.coverage * 100}%` }" />
        </span>
        <span class="doc-coverage-value">
          {{ s.actualWords }}<span class="doc-coverage-expected"> / {{ s.expectedWords }}w</span>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.doc-coverage-intro {
  font-size: 14px;
}
.doc-coverage-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
}
.doc-coverage-row {
  display: grid;
  grid-template-columns: minmax(180px, 340px) 1fr 110px;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 3px 0;
}
.doc-coverage-spec {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.doc-coverage-bar {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}
.doc-coverage-fill {
  display: block;
  height: 100%;
  border-radius: 0 4px 4px 0;
  background: var(--vp-c-brand-1);
}
.doc-coverage-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--vp-c-text-1);
}
.doc-coverage-expected {
  color: var(--vp-c-text-3);
}
@media (max-width: 560px) {
  .doc-coverage-row {
    grid-template-columns: 1fr 90px;
  }
  .doc-coverage-bar {
    display: none;
  }
}
</style>
