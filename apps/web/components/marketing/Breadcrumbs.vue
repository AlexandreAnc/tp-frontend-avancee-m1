<script setup lang="ts">
import { absoluteUrl } from '#shared/site';

/** Fil d'Ariane visible, et son équivalent schema.org pour les moteurs. */
const props = defineProps<{ items: { label: string; to: string }[] }>();

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: props.items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.label, item: absoluteUrl(item.to) })),
    }).replace(/</g, '\\u003c'),
  }],
});
</script>

<template>
  <nav aria-label="Fil d’Ariane" class="text-sm text-muted">
    <ol class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <li v-for="(item, index) in items" :key="item.to" class="flex items-center gap-2">
        <span v-if="index > 0" aria-hidden="true">/</span>
        <NuxtLink v-if="index < items.length - 1" :to="item.to" class="font-semibold text-muted underline underline-offset-[3px] hover:text-text">{{ item.label }}</NuxtLink>
        <span v-else aria-current="page" class="font-semibold text-text">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
