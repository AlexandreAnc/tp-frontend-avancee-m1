<script setup lang="ts">
import type { AgendaItem } from '@app/shared';
import type { IconName } from '~/utils/icons';

const props = defineProps<{ item: AgendaItem }>();

const VISUAL: Record<AgendaItem['kind'], { icon: IconName; tone: string }> = {
  event: { icon: 'calendar', tone: 'tone-info' },
  reminder: { icon: 'bell', tone: 'tone-warning' },
  deadline: { icon: 'hourglass', tone: 'tone-danger' },
};

const detail = computed(() => {
  const item = props.item;
  if (item.kind === 'event') return item.allDay ? 'Toute la journée' : [`${formatTime(item.start)}${item.end ? ` – ${formatTime(item.end)}` : ''}`, item.location].filter(Boolean).join(' · ');
  if (item.kind === 'reminder') return `Rappel · ${formatTime(item.start)}`;
  return `Échéance · ${item.fileName}`;
});
</script>

<template>
  <span class="icon-tile size-9" :class="VISUAL[item.kind].tone"><AppIcon :name="VISUAL[item.kind].icon" :size="13" /></span>
  <span class="flex min-w-0 flex-1 flex-col">
    <strong class="truncate font-bold">{{ item.title }}</strong>
    <span class="truncate text-2xs text-muted">{{ detail }}</span>
  </span>
</template>
