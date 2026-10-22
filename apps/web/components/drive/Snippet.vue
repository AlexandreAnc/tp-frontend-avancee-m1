<script setup lang="ts">
/** Extrait de recherche : les mots trouvés arrivent du serveur entre \u0001 et \u0002 (jamais de HTML). */
const props = defineProps<{ text: string }>();

const parts = computed(() => props.text.split(/(\u0001[^\u0002]*\u0002)/).filter(Boolean).map((part) => ({
  text: part.replace(/[\u0001\u0002]/g, ''),
  hit: part.startsWith('\u0001'),
})));
</script>

<template>
  <p class="snippet small">
    …<template v-for="(part, index) in parts" :key="index"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>…
  </p>
</template>

<style scoped>
.snippet {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--primary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: var(--surface-muted);
  color: var(--text-muted);
  line-height: 20px;
}

mark {
  padding: 0 2px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--amber) 45%, transparent);
  color: var(--text);
  font-weight: 700;
}
</style>
