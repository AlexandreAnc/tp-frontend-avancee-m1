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
  <li class="relative flex gap-3">
    <span class="icon-tile round z-1 border" :class="tone || 'bg-surface'"><AppIcon :name="entry.icon" :size="13" /></span>
    <div
      class="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border bg-surface p-[15px]"
      :class="{ 'border-[color-mix(in_srgb,var(--color-danger)_25%,var(--color-border))]': entry.status === 'failed' }"
    >
      <div class="flex justify-between gap-2">
        <strong class="font-extrabold [word-break:break-word]">{{ entry.title }}</strong>
        <span class="text-2xs font-extrabold text-muted">{{ formatTime(entry.createdAt) }}</span>
      </div>
      <p v-if="entry.detail" class="text-xs" :class="entry.status === 'failed' ? 'font-bold text-danger' : 'text-muted'">{{ entry.detail }}</p>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="badge" :class="STATUS[entry.status].tone">{{ STATUS[entry.status].label }}</span>
          <span class="badge"><AppIcon v-if="entry.origin === 'Agent'" name="microchip" :size="10" /><AppIcon v-else-if="entry.origin === 'Validé par vous'" name="face-smile" :size="10" />{{ entry.origin }}</span>
        </div>
        <button v-if="entry.undoable" class="text-btn text-text underline" type="button" :disabled="busy" @click="undo">Annuler</button>
      </div>
      <p v-if="error" class="text-xs font-bold text-danger">{{ error }}</p>
    </div>
  </li>
</template>
