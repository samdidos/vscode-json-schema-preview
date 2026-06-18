<script setup lang="ts">
import { data } from '../latestRelease.data'
</script>

<template>
  <div v-if="data.version" class="release-strip">
    <a :href="data.url ?? '#'" target="_blank" rel="noreferrer" class="release-link">
      <span class="release-icon">⬇</span>
      Download {{ data.version }}
      <span class="release-arrow">↗</span>
    </a>
  </div>
</template>

<style scoped>
.release-strip {
  display: flex;
  justify-content: center;
  margin: -16px 0 36px;
}

.release-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: background .15s, color .15s;
}

.release-link:hover {
  background: var(--vp-c-brand-soft);
}

.release-icon { font-size: 11px; }
.release-arrow { font-size: 11px; opacity: .7; }
</style>
