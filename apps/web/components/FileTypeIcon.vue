<script setup lang="ts">
import type { IconName } from '~/utils/icons';

const props = withDefaults(defineProps<{ mimeType: string; size?: number }>(), { size: 44 });

const kind = computed<{ icon: IconName; tone: string }>(() => {
  const type = props.mimeType;
  if (type === 'application/pdf') return { icon: 'file-pdf', tone: 'tone-danger' };
  if (type.startsWith('image/')) return { icon: 'image', tone: '' };
  if (type.includes('spreadsheet')) return { icon: 'file-excel', tone: 'tone-primary' };
  if (type.includes('wordprocessing')) return { icon: 'file-lines', tone: 'tone-info' };
  return { icon: 'file-lines', tone: '' };
});
</script>

<template>
  <span class="icon-tile" :class="kind.tone" :style="{ width: `${size}px`, height: `${size}px` }">
    <AppIcon :name="kind.icon" :size="Math.round(size * 0.41)" />
  </span>
</template>
