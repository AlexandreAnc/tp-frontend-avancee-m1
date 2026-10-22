<script setup lang="ts">
withDefaults(defineProps<{ size?: number; online?: boolean }>(), { size: 64, online: true });
</script>

<template>
  <span class="logo" :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${size / 4}px` }">
    <AppIcon name="microchip" :size="size * 0.375" />
    <span v-if="online" class="status" :style="{ width: `${size / 4}px`, height: `${size / 4}px` }" />
  </span>
</template>

<style scoped>
.logo {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ink);
  color: var(--on-ink);
  box-shadow: 0 10px 15px -3px rgb(28 31 35 / 0.2), 0 4px 6px -4px rgb(28 31 35 / 0.2);
}

.status {
  position: absolute;
  top: -4px;
  right: -4px;
  border-radius: 50%;
  background: var(--primary-bright);
  box-shadow: 0 0 0 4px var(--bg);
}
</style>
