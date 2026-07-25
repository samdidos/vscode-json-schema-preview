<script setup lang="ts">
// Multi-select dropdown for the requirement matrix filters (S10-SR-04): a
// labelled button that opens a checkbox list; several values can be active at
// once, and an empty selection means "no constraint". Closes on outside click
// or Escape. SSR-safe — the document listener is only wired on mount.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  label: string
  options: string[]
  modelValue: string[]
  /** Optional per-option tooltip text (e.g. status descriptions). */
  descriptions?: Record<string, string>
  /** Optional per-option display text; the option itself is the value. */
  labels?: Record<string, string>
  /** Overrides the button summary. Column selection reads "4 of 6", where an
   *  empty selection means "none shown" rather than the filters' "no
   *  constraint" — so the default wording would be actively wrong there. */
  summary?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const summaryText = computed(() => {
  if (props.summary !== undefined) return props.summary
  const n = props.modelValue.length
  if (n === 0) return 'All'
  if (n === 1) return props.modelValue[0]
  return `${n} selected`
})

function toggle(option: string) {
  const next = props.modelValue.includes(option)
    ? props.modelValue.filter((v) => v !== option)
    : [...props.modelValue, option]
  emit('update:modelValue', next)
}

function onDocumentMousedown(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) {
    open.value = false
  }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMousedown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="spec-filter">
    <button
      type="button"
      class="spec-filter-button"
      :class="{ active: modelValue.length > 0 }"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="open = !open"
    >
      <span class="spec-filter-label">{{ label }}:</span>
      <span class="spec-filter-summary">{{ summaryText }}</span>
      <span class="spec-filter-caret" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" class="spec-filter-panel" role="group" :aria-label="label">
      <label
        v-for="option in options"
        :key="option"
        class="spec-filter-option"
        :title="descriptions?.[option]"
      >
        <input
          type="checkbox"
          :checked="modelValue.includes(option)"
          @change="toggle(option)"
        />
        <span>{{ labels?.[option] ?? option }}</span>
      </label>
      <p v-if="options.length === 0" class="spec-filter-empty">No options</p>
    </div>
  </div>
</template>

<style scoped>
.spec-filter {
  position: relative;
  display: inline-block;
}
.spec-filter-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 13px;
  transition:
    color 0.2s,
    border-color 0.2s;
}
.spec-filter-button:hover {
  border-color: var(--vp-c-brand-1);
}
.spec-filter-button.active {
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}
.spec-filter-label {
  color: var(--vp-c-text-2);
}
.spec-filter-summary {
  font-weight: 500;
}
.spec-filter-caret {
  font-size: 10px;
  color: var(--vp-c-text-3);
}
.spec-filter-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  padding: 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background-color: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-3);
}
.spec-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
.spec-filter-option:hover {
  background-color: var(--vp-c-bg-soft);
}
.spec-filter-option input {
  cursor: pointer;
}
.spec-filter-empty {
  margin: 0;
  padding: 5px 8px;
  font-size: 13px;
  color: var(--vp-c-text-3);
}
</style>
