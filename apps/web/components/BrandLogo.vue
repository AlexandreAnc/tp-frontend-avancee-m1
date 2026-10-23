<script setup lang="ts">
withDefaults(defineProps<{ size?: number; online?: boolean }>(), { size: 64, online: true });
</script>

<template>
  <span class="relative inline-flex items-center justify-center bg-ink text-on-ink shadow-ink" :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${size / 4}px` }">
    <AppIcon name="microchip" :size="size * 0.375" />
    <span v-if="online" class="absolute -top-1 -right-1 rounded-full bg-primary-bright ring-4 ring-bg" :style="{ width: `${size / 4}px`, height: `${size / 4}px` }" />
  </span>
</template>
