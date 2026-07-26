<script setup lang="ts">
// "Changes over time" (S10-SR-14/15): every commit that touched this spec's
// file, newest first, each linking to that commit on the repository host.
// Derived at build time from `git log` — never a hand-maintained changelog
// (S10-NFR-01).
import { computed } from 'vue'
import { useData } from 'vitepress'
import { data } from '../specHistory.data'
import { REPO_COMMIT_URL } from './repo'

const { params } = useData()
const commits = computed(() => data[params.value?.id ?? ''] ?? [])
</script>

<template>
  <section class="spec-history">
    <h2 id="changes-over-time">
      Changes over time
      <a class="header-anchor" href="#changes-over-time" aria-label='Permalink to "Changes over time"'
        >&ZeroWidthSpace;</a
      >
    </h2>
    <ul v-if="commits.length" class="spec-history-list">
      <li v-for="c in commits" :key="c.sha">
        <a
          class="spec-history-sha"
          :href="`${REPO_COMMIT_URL}/${c.sha}`"
          target="_blank"
          rel="noreferrer"
          ><code>{{ c.shortSha }}</code></a
        >
        <span class="spec-history-date">{{ c.date }}</span>
        <span class="spec-history-subject">{{ c.subject }}</span>
      </li>
    </ul>
    <p v-else class="spec-history-empty">
      No history available for this spec file in this checkout.
    </p>
  </section>
</template>

<style scoped>
.spec-history-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.spec-history-list li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 0;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 13px;
}
.spec-history-sha {
  flex: none;
  font-family: var(--vp-font-family-mono);
}
.spec-history-date {
  flex: none;
  color: var(--vp-c-text-2);
  min-width: 88px;
}
.spec-history-subject {
  color: var(--vp-c-text-1);
}
.spec-history-empty {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
