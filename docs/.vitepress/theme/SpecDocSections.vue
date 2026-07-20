<script setup lang="ts">
// "Documented in" list on each spec page (S10-SR-08): the documentation
// sections carrying this spec's <!-- spec:… --> tags, with links to the
// docs-site page and nearest anchor (repository-only documents link to the
// repo host). Derived at build time from the S07 depth-metric library.
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { data } from '../docCoverage.data'
import { REPO_BLOB_URL } from './repo'

const { params } = useData()
const spec = computed(() => data.specs.find((s) => s.id === params.value?.id))
const sections = computed(() =>
  (spec.value?.sections ?? []).filter((s) => s.words > 0),
)

function hrefOf(s: (typeof sections.value)[number]): string {
  const hash = s.anchor ? `#${s.anchor}` : ''
  return s.page ? withBase(s.page) + hash : `${REPO_BLOB_URL}/${s.file}${hash}`
}
function labelOf(s: (typeof sections.value)[number]): string {
  return s.page ? s.page : s.file
}
</script>

<template>
  <section v-if="spec" class="spec-doc-sections">
    <h2 id="documented-in">
      Documented in
      <a class="header-anchor" href="#documented-in" aria-label='Permalink to "Documented in"'
        >&ZeroWidthSpace;</a
      >
    </h2>
    <p class="spec-doc-sections-intro">
      Documentation sections tagged <code>spec:{{ spec.id }}</code> (or one of its requirement
      ids) — {{ spec.actualWords }} of ~{{ spec.expectedWords }} expected words
      ({{ Math.round(spec.coverage * 100) }}%, expectation derived from
      {{ spec.documentableRequirements }} documentable requirements).
    </p>
    <span class="spec-doc-sections-bar" aria-hidden="true">
      <span class="spec-doc-sections-fill" :style="{ width: `${spec.coverage * 100}%` }" />
    </span>
    <ul v-if="sections.length" class="spec-doc-sections-list">
      <li v-for="(s, i) in sections" :key="i">
        <a :href="hrefOf(s)" :target="s.page ? undefined : '_blank'" :rel="s.page ? undefined : 'noreferrer'">
          {{ s.heading }}
        </a>
        <span class="spec-doc-sections-meta">{{ labelOf(s) }} · {{ s.words }} words</span>
      </li>
    </ul>
    <p v-else class="spec-doc-sections-empty">
      No documentation section is tagged for this spec yet — about
      {{ spec.expectedWords }} words are expected. Add a
      <code>&lt;!-- spec:{{ spec.id }} --&gt;</code> tag above the section that documents it.
    </p>
  </section>
</template>

<style scoped>
.spec-doc-sections-intro {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.spec-doc-sections-bar {
  display: block;
  height: 8px;
  margin: 4px 0 12px;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
  max-width: 420px;
}
.spec-doc-sections-fill {
  display: block;
  height: 100%;
  border-radius: 0 4px 4px 0;
  background: var(--vp-c-brand-1);
}
.spec-doc-sections-list {
  margin: 0;
}
.spec-doc-sections-list li {
  margin: 4px 0;
}
.spec-doc-sections-meta {
  margin-left: 8px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.spec-doc-sections-empty {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
