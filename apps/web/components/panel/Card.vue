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
  <article class="flex flex-col gap-3 rounded-lg border bg-surface p-[17px]" :class="{ 'border-l-4 border-l-danger pl-5': accent }">
    <header class="flex items-center gap-2.5">
      <span class="icon-tile size-7 rounded-sm" :class="tone ? `tone-${tone}` : ''"><AppIcon :name="icon" :size="12" /></span>
      <h2 class="min-w-0 flex-1">{{ title }}</h2>
      <span v-if="count" class="count-badge">{{ count }}</span>
      <slot name="aside" />
      <NuxtLink v-if="link" :to="link.to" class="inline-flex items-center gap-1 text-xs text-muted">{{ link.label }}<AppIcon name="chevron-right" :size="10" /></NuxtLink>
    </header>
    <slot />
  </article>
</template>
