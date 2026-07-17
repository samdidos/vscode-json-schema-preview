<script setup lang="ts">
// Requirement matrix table (S10-SR-03/04/05): lists every spec with its
// per-status requirement breakdown, filterable by status, kind, and free
// text. All data comes from the build-time loader — never hand-copied.
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { data } from '../specs.data'
import SpecStatusBadge from './SpecStatusBadge.vue'

const query = ref('')
const kind = ref<'all' | 'feature' | 'system'>('all')
const activeStatuses = ref(new Set<string>())

// Only offer statuses that actually occur in the matrix, in the order
// traceability.json declares them.
const presentStatuses = computed(() =>
  Object.keys(data.statuses).filter((s) => data.specs.some((spec) => spec.counts[s])),
)

function toggleStatus(status: string) {
  const next = new Set(activeStatuses.value)
  next.has(status) ? next.delete(status) : next.add(status)
  activeStatuses.value = next
}

const filtered = computed(() =>
  data.specs.filter((spec) => {
    if (kind.value !== 'all' && spec.kind !== kind.value) return false
    if (
      activeStatuses.value.size > 0 &&
      ![...activeStatuses.value].some((s) => spec.counts[s])
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
      <div class="spec-matrix-chips" role="group" aria-label="Filter by kind">
        <button
          v-for="k in ['all', 'feature', 'system'] as const"
          :key="k"
          class="spec-chip"
          :class="{ active: kind === k }"
          :aria-pressed="kind === k"
          @click="kind = k"
        >
          {{ k }}
        </button>
      </div>
      <div class="spec-matrix-chips" role="group" aria-label="Filter by requirement status">
        <button
          v-for="s in presentStatuses"
          :key="s"
          class="spec-chip"
          :class="{ active: activeStatuses.has(s) }"
          :aria-pressed="activeStatuses.has(s)"
          :title="data.statuses[s]"
          @click="toggleStatus(s)"
        >
          {{ s }}
        </button>
      </div>
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
.spec-matrix-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.spec-chip {
  padding: 2px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg-soft);
  transition:
    color 0.2s,
    border-color 0.2s;
}
.spec-chip:hover {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-1);
}
.spec-chip.active {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
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
