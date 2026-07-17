<script setup lang="ts">
// Requirement matrix table (S10-SR-03/04/05): lists every spec with its
// per-status requirement breakdown, filterable by status, kind, and free
// text. All data comes from the build-time loader — never hand-copied.
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { data } from '../specs.data'
import SpecStatusBadge from './SpecStatusBadge.vue'
import SpecFilterDropdown from './SpecFilterDropdown.vue'

const query = ref('')
// Both filters are multi-select (S10-SR-04): an empty array means "no
// constraint"; selected values combine as OR within a dropdown, and the two
// dropdowns plus the search box combine as AND.
const selectedKinds = ref<string[]>([])
const selectedStatuses = ref<string[]>([])

const kindOptions = ['feature', 'system']

// Only offer statuses that actually occur in the matrix, in the order
// traceability.json declares them.
const presentStatuses = computed(() =>
  Object.keys(data.statuses).filter((s) => data.specs.some((spec) => spec.counts[s])),
)

const hasActiveFilter = computed(
  () => selectedKinds.value.length > 0 || selectedStatuses.value.length > 0 || query.value !== '',
)

function resetFilters() {
  selectedKinds.value = []
  selectedStatuses.value = []
  query.value = ''
}

const filtered = computed(() =>
  data.specs.filter((spec) => {
    if (selectedKinds.value.length > 0 && !selectedKinds.value.includes(spec.kind)) return false
    if (
      selectedStatuses.value.length > 0 &&
      !selectedStatuses.value.some((s) => spec.counts[s])
    )
      return false
    const q = query.value.trim().toLowerCase()
    return !q || spec.id.toLowerCase().includes(q) || spec.title.toLowerCase().includes(q)
  }),
)

const totalRequirements = computed(() =>
  filtered.value.reduce((sum, spec) => sum + spec.requirements.length, 0),
)
</script>

<template>
  <div class="spec-matrix">
    <div class="spec-matrix-controls">
      <input
        v-model="query"
        type="search"
        class="spec-matrix-search"
        placeholder="Filter by id or title…"
        aria-label="Filter specs by id or title"
      />
      <SpecFilterDropdown v-model="selectedKinds" label="Kind" :options="kindOptions" />
      <SpecFilterDropdown
        v-model="selectedStatuses"
        label="Status"
        :options="presentStatuses"
        :descriptions="data.statuses"
      />
      <button v-if="hasActiveFilter" type="button" class="spec-matrix-reset" @click="resetFilters">
        Reset
      </button>
    </div>

    <p class="spec-matrix-summary">
      {{ filtered.length }} spec{{ filtered.length === 1 ? '' : 's' }} ·
      {{ totalRequirements }} requirement{{ totalRequirements === 1 ? '' : 's' }}
    </p>

    <div class="spec-matrix-table-wrapper">
      <table class="spec-matrix-table">
        <thead>
          <tr>
            <th>Spec</th>
            <th>Title</th>
            <th>Kind</th>
            <th>Requirements</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="spec in filtered" :key="spec.id">
            <td>
              <a :href="withBase(`/specs/${spec.id}`)">{{ spec.id }}</a>
            </td>
            <td>
              <a class="spec-title-link" :href="withBase(`/specs/${spec.id}`)">{{
                spec.title
              }}</a>
            </td>
            <td>{{ spec.kind }}</td>
            <td class="spec-matrix-badges">
              <SpecStatusBadge
                v-for="(count, status) in spec.counts"
                :key="status"
                :status="status as string"
                :count="count"
              />
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="4" class="spec-matrix-empty">No spec matches the current filters.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.spec-matrix-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  margin: 16px 0 8px;
}
.spec-matrix-search {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 14px;
  min-width: 220px;
}
.spec-matrix-search:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}
.spec-matrix-reset {
  font-size: 13px;
  color: var(--vp-c-text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.spec-matrix-reset:hover {
  color: var(--vp-c-brand-1);
}
.spec-matrix-summary {
  font-size: 13px;
  color: var(--vp-c-text-2);
  margin: 0 0 4px;
}
.spec-matrix-table-wrapper {
  overflow-x: auto;
}
.spec-matrix-table {
  width: 100%;
  margin: 8px 0 16px;
  display: table;
}
.spec-matrix-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.spec-title-link {
  color: inherit;
  font-weight: 400;
  text-decoration: none;
}
.spec-title-link:hover {
  color: var(--vp-c-brand-1);
}
.spec-matrix-empty {
  text-align: center;
  color: var(--vp-c-text-2);
}
</style>
