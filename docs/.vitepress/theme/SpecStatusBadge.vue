<script setup lang="ts">
defineProps<{ status: string; count?: number }>()
</script>

<template>
  <span class="spec-status-badge" :data-status="status">
    <template v-if="count !== undefined">{{ count }}&nbsp;</template>{{ status }}
  </span>
</template>

<style scoped>
.spec-status-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  background-color: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
}
.spec-status-badge[data-status='implemented'] {
  background-color: var(--vp-c-green-soft);
  color: var(--vp-c-green-1);
}
.spec-status-badge[data-status='manual'] {
  background-color: var(--vp-c-indigo-soft);
  color: var(--vp-c-indigo-1);
}
.spec-status-badge[data-status='planned'] {
  background-color: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-1);
}
.spec-status-badge[data-status='untracked'] {
  background-color: var(--vp-c-red-soft);
  color: var(--vp-c-red-1);
}
</style>
