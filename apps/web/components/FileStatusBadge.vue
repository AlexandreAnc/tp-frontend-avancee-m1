<script setup lang="ts">
import type { FileStatus } from '@app/shared';

defineProps<{ status: FileStatus }>();
</script>

<template>
  <span class="badge" :class="FILE_STATUS_LABELS[status].tone">
    <span v-if="status === 'processing'" class="spinner size-2.5 border-[1.5px]" />
    <AppIcon v-else :name="FILE_STATUS_LABELS[status].icon" :size="10" />
    {{ FILE_STATUS_LABELS[status].label }}
  </span>
</template>
