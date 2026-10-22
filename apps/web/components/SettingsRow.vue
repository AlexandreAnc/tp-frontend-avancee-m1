<script setup lang="ts">
import type { IconName } from '~/utils/icons';

defineProps<{ icon?: IconName; tone?: string; title: string; subtitle?: string; to?: string; danger?: boolean }>();
</script>

<template>
  <component :is="to ? resolveComponent('NuxtLink') : 'div'" :to="to" class="settings-row" :class="{ link: to, danger }">
    <span v-if="icon" class="icon-tile" :class="tone"><AppIcon :name="icon" :size="14" /></span>
    <span class="grow text">
      <strong>{{ title }}</strong>
      <span v-if="subtitle || $slots.subtitle" class="tiny muted"><slot name="subtitle">{{ subtitle }}</slot></span>
    </span>
    <slot />
    <AppIcon v-if="to" name="chevron-right" :size="12" class="chevron" />
  </component>
</template>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 12px 16px;
  color: var(--text);
  font-weight: 400;
}

.settings-row.link:hover {
  background: var(--surface-muted);
}

.icon-tile {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
}

.text {
  display: flex;
  flex-direction: column;
}

.text strong {
  font-weight: 800;
}

.danger strong {
  color: var(--danger);
}

.chevron {
  color: var(--text-muted);
}
</style>
