<script setup lang="ts">
import type { IconName } from '~/utils/icons';

defineProps<{ icon?: IconName; tone?: string; title: string; subtitle?: string; to?: string; danger?: boolean }>();
</script>

<template>
  <component :is="to ? resolveComponent('NuxtLink') : 'div'" :to="to" class="flex min-h-[60px] items-center gap-3 px-4 py-3 font-normal text-text" :class="{ 'hover:bg-surface-muted': to }">
    <span v-if="icon" class="icon-tile size-9 rounded-sm" :class="tone"><AppIcon :name="icon" :size="14" /></span>
    <span class="flex min-w-0 flex-1 flex-col">
      <strong class="font-extrabold" :class="{ 'text-danger': danger }">{{ title }}</strong>
      <span v-if="subtitle || $slots.subtitle" class="text-2xs text-muted"><slot name="subtitle">{{ subtitle }}</slot></span>
    </span>
    <slot />
    <AppIcon v-if="to" name="chevron-right" :size="12" class="text-muted" />
  </component>
</template>
