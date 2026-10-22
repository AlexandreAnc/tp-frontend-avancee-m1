<script setup lang="ts">
import type { AgendaItem } from '@app/shared';

const props = defineProps<{ today: AgendaItem[]; deadlines: Extract<AgendaItem, { kind: 'deadline' }>[]; calendarConnected: boolean }>();

const timed = computed(() => props.today.filter((item) => item.kind !== 'deadline'));

function subtitle(item: AgendaItem): string {
  if (item.kind === 'reminder') return item.status === 'done' ? 'Rappel · fait' : 'Rappel';
  if (item.kind === 'event') {
    if (item.allDay) return item.location ?? 'Toute la journée';
    return [item.end ? `${formatTime(item.start)} – ${formatTime(item.end)}` : null, item.location].filter(Boolean).join(' · ');
  }
  return item.fileName;
}
</script>

<template>
  <PanelCard title="Aujourd'hui" icon="calendar" tone="info" :link="{ to: '/planning', label: 'Planning' }">
    <ul v-if="timed.length" class="timeline">
      <li v-for="item in timed" :key="`${item.kind}-${item.id}`" :class="item.kind">
        <span class="time">{{ item.kind === 'event' && item.allDay ? 'Jour' : formatTime(item.start) }}</span>
        <span class="bar" />
        <span class="grow">
          <strong class="ellipsis">{{ item.title }}</strong>
          <span class="tiny muted ellipsis">{{ subtitle(item) }}</span>
        </span>
      </li>
    </ul>
    <div v-else class="empty-state">
      <span class="icon-tile tone-info"><AppIcon name="calendar-check" :size="16" /></span>
      <strong>Journée libre</strong>
      <p>{{ calendarConnected ? 'Aucun événement aujourd’hui.' : 'Connectez Google Agenda pour voir vos événements.' }}</p>
      <NuxtLink :to="calendarConnected ? '/planning' : '/settings'" class="btn btn-sm">
        {{ calendarConnected ? '+ Ajouter un rappel' : 'Connecter Google Agenda' }}
      </NuxtLink>
    </div>

    <NuxtLink v-for="deadline in deadlines" :key="deadline.id" to="/planning" class="deadline">
      <AppIcon name="hourglass" :size="12" />
      <strong class="ellipsis">{{ deadline.title }}</strong>
      <span class="tiny ellipsis grow">· {{ deadline.fileName }}</span>
      <span class="days">J‑{{ daysUntil(deadline.start) }}</span>
    </NuxtLink>
  </PanelCard>
</template>

<style scoped>
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline li {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.time {
  width: 40px;
  flex-shrink: 0;
  font-size: 12px;
  line-height: 20px;
  font-weight: 700;
  color: var(--text-muted);
}

.bar {
  width: 3px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  background: var(--info);
}

.reminder .bar {
  background: var(--border);
}

.timeline .grow {
  display: flex;
  flex-direction: column;
}

.deadline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
  line-height: 16px;
}

.deadline strong {
  color: var(--text);
  font-weight: 700;
}

.deadline .tiny {
  color: var(--text-muted);
}

.days {
  font-weight: 800;
}
</style>
