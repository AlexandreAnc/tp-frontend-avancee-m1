<script setup lang="ts">
import type { JournalEntry } from '~/components/JournalItem.vue';

defineProps<{ entries: JournalEntry[] }>();

const DOT: Record<JournalEntry['status'], string> = {
  success: 'var(--primary)',
  failed: 'var(--danger)',
  refused: 'var(--text-muted)',
  expired: 'var(--text-muted)',
  undone: 'var(--text-muted)',
};
</script>

<template>
  <PanelCard title="Activité" icon="history" :link="{ to: '/journal', label: 'Journal' }">
    <ul v-if="entries.length" class="activity">
      <li v-for="entry in entries" :key="entry.id">
        <span class="dot" :style="{ background: DOT[entry.status] }" />
        <span class="grow">
          <strong>{{ entry.title }}</strong>
          <span class="tiny muted">{{ formatTime(entry.createdAt) }} · {{ entry.origin }}</span>
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

<style scoped>
.activity {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity li {
  display: flex;
  gap: 10px;
}

.activity .grow {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  line-height: 16px;
}

.activity strong {
  font-weight: 700;
}

.dot {
  width: 8px;
  height: 8px;
  margin-top: 4px;
  flex-shrink: 0;
  border-radius: 50%;
}
</style>
