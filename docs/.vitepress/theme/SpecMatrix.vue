<script setup lang="ts">
// Requirement matrix table (S10-SR-03/04/05): lists every spec with its
// per-status requirement breakdown, filterable by status, kind, and free
// text. All data comes from the build-time loader — never hand-copied.
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import { data } from '../specs.data'
import type { SpecEntry } from '../specs.data'
import SpecStatusBadge from './SpecStatusBadge.vue'
import SpecFilterDropdown from './SpecFilterDropdown.vue'

const query = ref('')
// Both filters are multi-select (S10-SR-04): an empty array means "no
// constraint"; selected values combine as OR within a dropdown, and the two
// dropdowns plus the search box combine as AND.
const selectedKinds = ref<string[]>([])
const selectedStatuses = ref<string[]>([])

const kindOptions = ['feature', 'system']

// Column visibility (S10-SR-10). The spec id is deliberately absent from the
// options: a row must stay identifiable, so it can never be switched off.
const COLUMN_LABELS: Record<string, string> = {
  title: 'Title',
  kind: 'Kind',
  requirements: 'Requirements',
  effort: 'Effort',
  value: 'Value',
  rice: 'RICE',
}
const columnOptions = Object.keys(COLUMN_LABELS)
const visibleColumns = ref<string[]>([...columnOptions])
const shows = (c: string) => visibleColumns.value.includes(c)
const columnSummary = computed(() => `${visibleColumns.value.length} of ${columnOptions.length}`)
// Spec id + every visible column, for the empty-state row's colspan.
const columnCount = computed(() => visibleColumns.value.length + 1)

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

// Column sort (S10-SR-16): id/title/kind sort as text, the rest as numbers.
// A null metric (S10-SR-09's "not scored") always sorts after every scored
// row so a descending sort never puts an unscored spec above a low one.
type SortKey = 'id' | 'title' | 'kind' | 'requirements' | 'effort' | 'value' | 'rice'
const SORT_VALUE: Record<SortKey, (spec: SpecEntry) => string | number | null> = {
  id: (s) => s.id,
  title: (s) => s.title,
  kind: (s) => s.kind,
  requirements: (s) => s.requirements.length,
  effort: (s) => s.metrics.points,
  value: (s) => s.metrics.value,
  rice: (s) => s.metrics.rice,
}
const sortKey = ref<SortKey | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

// Cycle: unsorted -> asc -> desc -> unsorted, matching a fresh column's asc-first click.
function toggleSort(key: SortKey) {
  if (sortKey.value !== key) {
    sortKey.value = key
    sortDir.value = 'asc'
  } else if (sortDir.value === 'asc') {
    sortDir.value = 'desc'
  } else {
    sortKey.value = null
  }
}

function ariaSort(key: SortKey): 'none' | 'ascending' | 'descending' {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

const sorted = computed(() => {
  const key = sortKey.value
  if (!key) return filtered.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  const getValue = SORT_VALUE[key]
  return [...filtered.value].sort((a, b) => {
    const va = getValue(a)
    const vb = getValue(b)
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
    return ((va as number) - (vb as number)) * dir
  })
})
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
      <SpecFilterDropdown
        v-model="visibleColumns"
        label="Columns"
        :options="columnOptions"
        :labels="COLUMN_LABELS"
        :summary="columnSummary"
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
            <th :aria-sort="ariaSort('id')">
              <button type="button" class="spec-matrix-sort" @click="toggleSort('id')">
                Spec<span class="spec-matrix-sort-icon" aria-hidden="true">{{
                  sortKey === 'id' ? (sortDir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
            <th v-if="shows('title')" :aria-sort="ariaSort('title')">
              <button type="button" class="spec-matrix-sort" @click="toggleSort('title')">
                Title<span class="spec-matrix-sort-icon" aria-hidden="true">{{
                  sortKey === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
            <th v-if="shows('kind')" :aria-sort="ariaSort('kind')">
              <button type="button" class="spec-matrix-sort" @click="toggleSort('kind')">
                Kind<span class="spec-matrix-sort-icon" aria-hidden="true">{{
                  sortKey === 'kind' ? (sortDir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
            <th v-if="shows('requirements')" :aria-sort="ariaSort('requirements')">
              <button type="button" class="spec-matrix-sort" @click="toggleSort('requirements')">
                Requirements<span class="spec-matrix-sort-icon" aria-hidden="true">{{
                  sortKey === 'requirements' ? (sortDir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
            <th v-if="shows('effort')" :aria-sort="ariaSort('effort')" title="Advisory effort estimate (S13)">
              <button type="button" class="spec-matrix-sort" @click="toggleSort('effort')">
                Effort<span class="spec-matrix-sort-icon" aria-hidden="true">{{
                  sortKey === 'effort' ? (sortDir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
            <th v-if="shows('value')" :aria-sort="ariaSort('value')" title="Advisory customer-value estimate (S16)">
              <button type="button" class="spec-matrix-sort" @click="toggleSort('value')">
                Value<span class="spec-matrix-sort-icon" aria-hidden="true">{{
                  sortKey === 'value' ? (sortDir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
            <th v-if="shows('rice')" :aria-sort="ariaSort('rice')" title="Advisory value ÷ effort points (S16)">
              <button type="button" class="spec-matrix-sort" @click="toggleSort('rice')">
                RICE<span class="spec-matrix-sort-icon" aria-hidden="true">{{
                  sortKey === 'rice' ? (sortDir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="spec in sorted" :key="spec.id">
            <td>
              <a :href="withBase(`/specs/${spec.id}`)">{{ spec.id }}</a>
            </td>
            <td v-if="shows('title')">
              <a class="spec-title-link" :href="withBase(`/specs/${spec.id}`)">{{
                spec.title
              }}</a>
            </td>
            <td v-if="shows('kind')">{{ spec.kind }}</td>
            <td v-if="shows('requirements')" class="spec-matrix-badges">
              <SpecStatusBadge
                v-for="(count, status) in spec.counts"
                :key="status"
                :status="status as string"
                :count="count"
              />
            </td>
            <td v-if="shows('effort')" class="spec-matrix-metric">
              <template v-if="spec.metrics.points !== null">
                {{ spec.metrics.points }}<small> pts</small>
                <span class="spec-matrix-tshirt">{{ spec.metrics.tshirt }}</span>
              </template>
              <span v-else class="spec-matrix-unscored" title="No estimate">—</span>
            </td>
            <td v-if="shows('value')" class="spec-matrix-metric">
              <template v-if="spec.metrics.value !== null">
                {{ spec.metrics.value.toFixed(1) }}
                <span class="spec-matrix-tier" :data-tier="spec.metrics.tier">{{
                  spec.metrics.tier
                }}</span>
              </template>
              <span v-else class="spec-matrix-unscored" title="System specs are not scored for customer value (S16-SR-06)">
                not scored
              </span>
            </td>
            <td v-if="shows('rice')" class="spec-matrix-metric">
              <template v-if="spec.metrics.rice !== null">{{
                spec.metrics.rice.toFixed(2)
              }}</template>
              <span v-else class="spec-matrix-unscored" title="No value estimate to divide">—</span>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td :colspan="columnCount" class="spec-matrix-empty">
              No spec matches the current filters.
            </td>
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
.spec-matrix-sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  cursor: pointer;
}
.spec-matrix-sort:hover {
  color: var(--vp-c-brand-1);
}
.spec-matrix-sort-icon {
  font-size: 10px;
  color: var(--vp-c-brand-1);
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
/* Advisory columns (S10-SR-09) — dimmer than the counted facts beside them,
   so an estimate never reads with the same authority as a status count. */
.spec-matrix-metric {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.spec-matrix-metric small {
  color: var(--vp-c-text-3);
}
.spec-matrix-tshirt {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  background-color: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 600;
}
.spec-matrix-tier {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  background-color: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 600;
}
.spec-matrix-tier[data-tier='Critical'] {
  background-color: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}
.spec-matrix-tier[data-tier='High'] {
  background-color: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
}
.spec-matrix-unscored {
  color: var(--vp-c-text-3);
  font-size: 12px;
}
</style>
