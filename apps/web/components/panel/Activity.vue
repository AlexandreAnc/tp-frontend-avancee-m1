<script setup lang="ts">
import type { JournalEntry } from '~/components/JournalItem.vue';

defineProps<{ entries: JournalEntry[] }>();

const DOT: Record<JournalEntry['status'], string> = {
  success: 'var(--color-primary)',
  failed: 'var(--color-danger)',
  refused: 'var(--color-muted)',
  expired: 'var(--color-muted)',
  undone: 'var(--color-muted)',
};
</script>

<template>
  <PanelCard title="Activité" icon="history" :link="{ to: '/journal', label: 'Journal' }">
    <ul v-if="entries.length" class="flex flex-col gap-3">
      <li v-for="entry in entries" :key="entry.id" class="flex gap-2.5">
        <span class="mt-1 size-2 shrink-0 rounded-full" :style="{ background: DOT[entry.status] }" />
        <span class="flex min-w-0 flex-1 flex-col text-xs">
          <strong class="font-bold">{{ entry.title }}</strong>
          <span class="text-2xs text-muted">{{ formatTime(entry.createdAt) }} · {{ entry.origin }}</span>
        </span>
      </li>
    </ul>
    <div v-else class="empty-state">
      <span class="icon-tile"><AppIcon name="clock-rotate-left" :size="16" /></span>
      <strong>Pas encore d'activité</strong>
      <p>Elle s'affichera ici.</p>
    </div>
  </PanelCard>
</template>
