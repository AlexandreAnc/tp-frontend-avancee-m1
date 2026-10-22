<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';

export type JournalEntry = ApiResponse<'/api/journal', 'get'>['entries'][number];

const props = defineProps<{ entry: JournalEntry }>();
const emit = defineEmits<{ changed: [] }>();
const busy = ref(false);
const error = ref<string | null>(null);

const STATUS: Record<JournalEntry['status'], { label: string; tone: string }> = {
  success: { label: 'Réussie', tone: 'tone-primary' },
  failed: { label: 'Échec', tone: 'tone-danger' },
  refused: { label: 'Refusée', tone: '' },
  expired: { label: 'Expirée', tone: '' },
  undone: { label: 'Annulée', tone: '' },
};
const tone = computed(() => (props.entry.status === 'failed' ? 'tone-danger' : props.entry.icon === 'bell' ? 'tone-primary' : props.entry.icon === 'file' ? 'tone-info' : ''));

async function undo() {
  if (!props.entry.activityId) return;
  busy.value = true;
  error.value = null;
  try {
    await $fetch(`/api/activity/${props.entry.activityId}/undo`, { method: 'POST' });
    emit('changed');
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <li class="entry">
    <span class="icon-tile round" :class="tone"><AppIcon :name="entry.icon" :size="13" /></span>
    <div class="body" :class="{ failed: entry.status === 'failed' }">
      <div class="top">
        <strong class="title">{{ entry.title }}</strong>
        <span class="tiny muted strong">{{ formatTime(entry.createdAt) }}</span>
      </div>
      <p v-if="entry.detail" class="small" :class="entry.status === 'failed' ? 'error' : 'muted'">{{ entry.detail }}</p>
      <div class="row between">
        <div class="row">
          <span class="badge" :class="STATUS[entry.status].tone">{{ STATUS[entry.status].label }}</span>
          <span class="badge"><AppIcon v-if="entry.origin === 'Agent'" name="microchip" :size="10" /><AppIcon v-else-if="entry.origin === 'Validé par vous'" name="face-smile" :size="10" />{{ entry.origin }}</span>
        </div>
        <button v-if="entry.undoable" class="text-btn undo" type="button" :disabled="busy" @click="undo">Annuler</button>
      </div>
      <p v-if="error" class="small error">{{ error }}</p>
    </div>
  </li>
</template>

<style scoped>
.entry {
  position: relative;
  display: flex;
  gap: 12px;
}

.entry .icon-tile {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  background: var(--surface);
  z-index: 1;
}

.entry .icon-tile.tone-danger {
  background: var(--danger-soft);
}

.entry .icon-tile.tone-primary {
  background: var(--primary-soft);
}

.entry .icon-tile.tone-info {
  background: var(--info-soft);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.body.failed {
  border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.title {
  font-weight: 800;
  word-break: break-word;
}

.error {
  color: var(--danger);
  font-weight: 700;
}

.undo {
  color: var(--text);
  text-decoration: underline;
}
</style>
