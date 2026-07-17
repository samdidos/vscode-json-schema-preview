<script setup lang="ts">
// Status legend for the guidelines page, generated from traceability.json's
// own `statuses` map (S10-NFR-01: status meanings are never hand-copied
// into docs/).
import { data } from '../specs.data'
import SpecStatusBadge from './SpecStatusBadge.vue'
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Meaning</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(meaning, status) in data.statuses" :key="status">
        <td><SpecStatusBadge :status="status as string" /></td>
        <td>{{ meaning }}</td>
      </tr>
    </tbody>
  </table>
</template>
