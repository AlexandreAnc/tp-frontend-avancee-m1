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
  <span class="icon-tile" :class="VISUAL[item.kind].tone"><AppIcon :name="VISUAL[item.kind].icon" :size="13" /></span>
  <span class="grow agenda-text">
    <strong class="ellipsis">{{ item.title }}</strong>
    <span class="tiny muted ellipsis">{{ detail }}</span>
  </span>
</template>

<style scoped>
.icon-tile {
  width: 36px;
  height: 36px;
}

.agenda-text {
  display: flex;
  flex-direction: column;
}

.agenda-text strong {
  font-weight: 700;
}
</style>
