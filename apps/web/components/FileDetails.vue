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
  <section class="details">
    <header class="head">
      <FileTypeIcon :mime-type="file.mimeType" :size="40" />
      <div class="grow">
        <span class="section-label">Infos clés</span>
        <strong class="name">{{ file.name }}</strong>
      </div>
    </header>
    <p v-if="file.analysis" class="summary small">{{ file.analysis.summary }}</p>
    <dl v-if="facts.length" class="facts">
      <div v-for="fact in facts" :key="`${fact.term}-${fact.value}`" class="fact">
        <dt class="small muted strong">{{ fact.term }}</dt>
        <dd :class="{ deadline: fact.deadline, list: 'list' in fact }">{{ fact.value }}</dd>
      </div>
    </dl>
    <p v-else-if="file.status === 'ready'" class="small muted pad">Aucune information clé repérée dans ce document.</p>
    <footer class="actions">
      <button class="btn btn-sm btn-ink" type="button" @click="emit('preview', file.id)"><AppIcon name="eye" :size="12" />Aperçu</button>
      <button class="btn btn-sm" type="button" @click="emit('reindex', file.id)"><AppIcon name="rotate-right" :size="12" />Réanalyser</button>
      <button class="btn btn-sm" type="button" @click="emit('delete', file.id)"><AppIcon name="trash" :size="12" />Corbeille</button>
    </footer>
  </section>
</template>

<style scoped>
.details {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.head .grow {
  display: flex;
  flex-direction: column;
}

.name {
  font-weight: 800;
  word-break: break-word;
}

.summary {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
}

.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin: 0;
  background: var(--border);
}

.fact {
  padding: 13px 14px 16px;
  background: var(--surface);
}

.fact dd {
  margin: 2px 0 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 800;
  word-break: break-word;
}

.fact:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.fact dd.list {
  font-size: 14px;
  line-height: 20px;
}

.fact dd.deadline {
  color: var(--danger);
}

.pad {
  padding: 16px;
}

.actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
</style>
