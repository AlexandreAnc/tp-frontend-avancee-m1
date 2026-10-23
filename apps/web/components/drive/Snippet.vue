<script setup lang="ts">
/** Extrait de recherche : les mots trouvés arrivent du serveur entre \u0001 et \u0002 (jamais de HTML). */
const props = defineProps<{ text: string }>();

const parts = computed(() => props.text.split(/(\u0001[^\u0002]*\u0002)/).filter(Boolean).map((part) => ({
  text: part.replace(/[\u0001\u0002]/g, ''),
  hit: part.startsWith('\u0001'),
})));
</script>

<template>
  <p class="rounded-r-sm border-l-3 border-l-primary bg-surface-muted px-3 py-2 text-xs leading-5 text-muted">
    …<template v-for="(part, index) in parts" :key="index"><mark v-if="part.hit" class="rounded-[calc(var(--radius-xs)-1px)] bg-amber/45 px-0.5 font-bold text-text">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>…
  </p>
</template>
