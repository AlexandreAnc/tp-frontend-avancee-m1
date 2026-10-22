<script setup lang="ts">
import type { FileStatus } from '@app/shared';

defineProps<{ status: FileStatus }>();
</script>

<template>
  <span class="badge" :class="FILE_STATUS_LABELS[status].tone">
    <span v-if="status === 'processing'" class="spinner mini" />
    <AppIcon v-else :name="FILE_STATUS_LABELS[status].icon" :size="10" />
    {{ FILE_STATUS_LABELS[status].label }}
  </span>
</template>

<style scoped>
.mini {
  width: 10px;
  height: 10px;
  border-width: 1.5px;
}
</style>
