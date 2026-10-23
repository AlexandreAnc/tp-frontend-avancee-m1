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
    <ul v-if="timed.length" class="flex flex-col gap-3.5">
      <li v-for="item in timed" :key="`${item.kind}-${item.id}`" class="flex items-stretch gap-3">
        <span class="w-10 shrink-0 text-[12px] leading-5 font-bold text-muted">{{ item.kind === 'event' && item.allDay ? 'Jour' : formatTime(item.start) }}</span>
        <span class="w-[3px] shrink-0 rounded-full" :class="item.kind === 'reminder' ? 'bg-border' : 'bg-info'" />
        <span class="flex min-w-0 flex-1 flex-col">
          <strong class="truncate">{{ item.title }}</strong>
          <span class="truncate text-2xs text-muted">{{ subtitle(item) }}</span>
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

    <NuxtLink v-for="deadline in deadlines" :key="deadline.id" to="/planning" class="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-xs text-danger">
      <AppIcon name="hourglass" :size="12" />
      <strong class="truncate font-bold text-text">{{ deadline.title }}</strong>
      <span class="min-w-0 flex-1 truncate text-2xs text-muted">· {{ deadline.fileName }}</span>
      <span class="font-extrabold">J‑{{ daysUntil(deadline.start) }}</span>
    </NuxtLink>
  </PanelCard>
</template>
