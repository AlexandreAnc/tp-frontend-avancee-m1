<script setup lang="ts">
/** Texte d'article avec liens internes `[texte](/chemin)` et gras `**texte**`, sans jamais interpréter de HTML. */
const props = defineProps<{ text: string }>();

type Segment = { kind: 'text' | 'strong'; value: string } | { kind: 'link'; value: string; to: string };

const segments = computed<Segment[]>(() => {
  const result: Segment[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of props.text.matchAll(pattern)) {
    if (match.index > last) result.push({ kind: 'text', value: props.text.slice(last, match.index) });
    if (match[1]) result.push({ kind: 'link', value: match[1], to: match[2]! });
    else result.push({ kind: 'strong', value: match[3]! });
    last = match.index + match[0].length;
  }
  if (last < props.text.length) result.push({ kind: 'text', value: props.text.slice(last) });
  return result;
});
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <NuxtLink v-if="segment.kind === 'link'" :to="segment.to" class="underline decoration-1 underline-offset-[3px] hover:decoration-2">{{ segment.value }}</NuxtLink>
    <strong v-else-if="segment.kind === 'strong'" class="font-extrabold">{{ segment.value }}</strong>
    <template v-else>{{ segment.value }}</template>
  </template>
</template>
