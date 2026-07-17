<script setup lang="ts">
// Provenance line at the top of every generated spec page: the page is a
// build-time render of the spec file in the repository, which stays the only
// write path (S10-NFR-01) — so link back to it.
import { useData } from 'vitepress'
import { REPO_BLOB_URL } from './repo'

const { params } = useData()
</script>

<template>
  <p v-if="params?.file" class="spec-source-link">
    Rendered from
    <a :href="`${REPO_BLOB_URL}/specs/${params.file}`" target="_blank" rel="noreferrer"
      ><code>specs/{{ params.file }}</code></a
    >
    — edit it there, not here.
  </p>
</template>

<style scoped>
.spec-source-link {
  font-size: 13px;
  color: var(--vp-c-text-2);
  margin-bottom: 8px;
}
</style>
