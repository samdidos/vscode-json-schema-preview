<script setup lang="ts">
// Per-spec requirement traceability table (S10-SR-07), rendered at the bottom
// of every generated spec page: each requirement's status, implementing
// files (linked to the repository), and matrix note.
import { computed } from 'vue'
import { useData } from 'vitepress'
import { data } from '../specs.data'
import SpecStatusBadge from './SpecStatusBadge.vue'
import { REPO_BLOB_URL } from './repo'

const { params } = useData()
const spec = computed(() => data.specs.find((s) => s.id === params.value?.id))
</script>

<template>
  <section v-if="spec && spec.requirements.length" class="spec-traceability">
    <h2 id="requirement-traceability">
      Requirement traceability
      <a
        class="header-anchor"
        href="#requirement-traceability"
        aria-label='Permalink to "Requirement traceability"'
        >&ZeroWidthSpace;</a
      >
    </h2>
    <p class="spec-traceability-intro">
      Status of each requirement in <code>specs/traceability.json</code>. Test coverage is
      auto-discovered from <code>[ID]</code> tags in test titles and is not listed here.
    </p>
    <div class="spec-traceability-wrapper">
      <table class="spec-traceability-table">
        <thead>
          <tr>
            <th>Requirement</th>
            <th>Status</th>
            <th>Implementation</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="req in spec.requirements" :key="req.id">
            <td><code>{{ req.id }}</code></td>
            <td><SpecStatusBadge :status="req.status" /></td>
            <td>
              <template v-for="(file, i) in req.impl" :key="file">
                <a :href="`${REPO_BLOB_URL}/${file}`" target="_blank" rel="noreferrer">{{
                  file
                }}</a
                ><template v-if="i < req.impl.length - 1">, </template>
              </template>
              <span v-if="req.impl.length === 0">—</span>
            </td>
            <td class="spec-traceability-note">{{ req.note ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.spec-traceability-intro {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.spec-traceability-wrapper {
  overflow-x: auto;
}
.spec-traceability-table {
  display: table;
  width: 100%;
}
.spec-traceability-table td {
  vertical-align: top;
}
.spec-traceability-note {
  font-size: 13px;
  color: var(--vp-c-text-2);
  min-width: 200px;
}
</style>
