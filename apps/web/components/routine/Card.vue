<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';

export type RoutineItem = ApiResponse<'/api/routines', 'get'>['routines'][number];

const props = defineProps<{ routine: RoutineItem; busy?: boolean }>();
const emit = defineEmits<{ toggle: []; run: []; edit: [] }>();

const lastRun = computed(() => {
  const run = props.routine.lastRun;
  if (!run) return null;
  const when = daysUntil(run.createdAt) === 0 ? `aujourd’hui ${formatTime(run.createdAt)}` : daysUntil(run.createdAt) === -1 ? 'hier' : formatShortDate(run.createdAt);
  if (run.status === 'success') return { tone: 'tone-primary', icon: 'check' as const, text: `Réussie ${when}` };
  const failed = run.steps.find((step) => step.status === 'failed');
  if (run.status === 'partial') return { tone: 'tone-warning', icon: 'circle-half' as const, text: `Partielle ${when}` };
  return { tone: 'tone-danger', icon: 'xmark' as const, text: `Échec ${when}${failed?.error ? ` · ${failed.error}` : ''}` };
});
</script>

<template>
  <article class="flex flex-col gap-3 rounded-lg border bg-surface p-4" :class="{ 'opacity-60': !routine.enabled }">
    <div class="flex items-center gap-3">
      <span class="icon-tile size-11" :class="ROUTINE_ICON_TONES[routine.icon]"><AppIcon :name="routine.icon" :size="16" /></span>
      <button class="flex min-w-0 flex-1 cursor-pointer flex-col items-start p-0 text-left" type="button" @click="emit('edit')">
        <strong class="text-[15px] font-extrabold">{{ routine.name }}</strong>
        <span class="text-xs text-muted">{{ routine.steps.length }} action{{ routine.steps.length > 1 ? 's' : '' }}{{ routine.schedule ? ` · ${describeDays(routine.schedule.days)}` : '' }}{{ routine.enabled ? '' : ' · en pause' }}</span>
      </button>
      <button class="switch" type="button" role="switch" :aria-checked="routine.enabled" :aria-label="`Activer ${routine.name}`" @click="emit('toggle')" />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span v-if="routine.schedule" class="inline-flex items-center gap-1 rounded-tag bg-surface-muted px-2 py-1 text-[12px] font-bold"><AppIcon name="clock" :size="10" />{{ routine.schedule.time }}</span>
      <span v-if="lastRun" class="badge" :class="lastRun.tone"><AppIcon :name="lastRun.icon" :size="10" />{{ lastRun.text }}</span>
      <button class="btn btn-sm ml-auto" type="button" :disabled="busy" @click="emit('run')">
        <span v-if="busy" class="spinner" /><AppIcon v-else name="play" :size="10" />Lancer
      </button>
    </div>
  </article>
</template>
