<script setup lang="ts">
import type { IconName } from '~/utils/icons';

defineProps<{
  title: string;
  icon: IconName;
  tone?: 'primary' | 'info' | 'warning' | 'danger';
  link?: { to: string; label: string };
  count?: number;
  accent?: boolean;
}>();
</script>

<template>
  <article class="panel-card" :class="{ accent }">
    <header class="head">
      <span class="icon-tile" :class="tone ? `tone-${tone}` : ''"><AppIcon :name="icon" :size="12" /></span>
      <h2 class="grow">{{ title }}</h2>
      <span v-if="count" class="count-badge">{{ count }}</span>
      <slot name="aside" />
      <NuxtLink v-if="link" :to="link.to" class="link">{{ link.label }}<AppIcon name="chevron-right" :size="10" /></NuxtLink>
    </header>
    <slot />
  </article>
</template>

<style scoped>
.panel-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 17px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.panel-card.accent {
  border-left: 4px solid var(--danger);
  padding-left: 20px;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.head .icon-tile {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 16px;
}
</style>
