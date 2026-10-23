<script setup lang="ts">
import type { FileItem } from './FileRow.vue';

const props = defineProps<{ file: FileItem }>();
const emit = defineEmits<{ preview: [id: string]; reindex: [id: string]; delete: [id: string] }>();

const facts = computed(() => {
  const info = props.file.analysis?.keyInfo;
  if (!info) return [];
  return [
    ...info.amounts.map((amount) => ({ term: amount.label, value: amount.value, deadline: false })),
    ...info.dates.map((date) => ({ term: date.label, value: date.iso ? formatShortDate(date.iso) : date.value, deadline: Boolean(date.isDeadline) })),
    ...(info.names.length ? [{ term: 'Noms', value: info.names.join(', '), deadline: false, list: true }] : []),
  ];
});
</script>

<template>
  <section class="overflow-hidden rounded-lg border bg-surface">
    <header class="flex items-center gap-3 border-b p-4">
      <FileTypeIcon :mime-type="file.mimeType" :size="40" />
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="section-label">Infos clés</span>
        <strong class="font-extrabold [word-break:break-word]">{{ file.name }}</strong>
      </div>
    </header>
    <p v-if="file.analysis" class="border-b px-4 py-3 text-xs text-muted">{{ file.analysis.summary }}</p>
    <dl v-if="facts.length" class="grid grid-cols-[1fr_1fr] gap-px bg-border">
      <div v-for="fact in facts" :key="`${fact.term}-${fact.value}`" class="bg-surface px-3.5 pt-[13px] pb-4 last:odd:col-span-full">
        <dt class="text-xs font-extrabold text-muted">{{ fact.term }}</dt>
        <dd class="mt-0.5 font-extrabold [word-break:break-word]" :class="['list' in fact ? 'text-sm' : 'text-[16px] leading-6', { 'text-danger': fact.deadline }]">{{ fact.value }}</dd>
      </div>
    </dl>
    <p v-else-if="file.status === 'ready'" class="p-4 text-xs text-muted">Aucune information clé repérée dans ce document.</p>
    <footer class="flex gap-2 border-t px-4 py-3">
      <button class="btn btn-sm btn-ink" type="button" @click="emit('preview', file.id)"><AppIcon name="eye" :size="12" />Aperçu</button>
      <button class="btn btn-sm" type="button" @click="emit('reindex', file.id)"><AppIcon name="rotate-right" :size="12" />Réanalyser</button>
      <button class="btn btn-sm" type="button" @click="emit('delete', file.id)"><AppIcon name="trash" :size="12" />Corbeille</button>
    </footer>
  </section>
</template>
