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
  <article class="routine" :class="{ paused: !routine.enabled }">
    <div class="main">
      <span class="icon-tile" :class="ROUTINE_ICON_TONES[routine.icon]"><AppIcon :name="routine.icon" :size="16" /></span>
      <button class="grow text" type="button" @click="emit('edit')">
        <strong>{{ routine.name }}</strong>
        <span class="small muted">{{ routine.steps.length }} action{{ routine.steps.length > 1 ? 's' : '' }}{{ routine.schedule ? ` · ${describeDays(routine.schedule.days)}` : '' }}{{ routine.enabled ? '' : ' · en pause' }}</span>
      </button>
      <button class="switch" type="button" role="switch" :aria-checked="routine.enabled" :aria-label="`Activer ${routine.name}`" @click="emit('toggle')" />
    </div>
    <div class="row chips-row">
      <span v-if="routine.schedule" class="tag"><AppIcon name="clock" :size="10" />{{ routine.schedule.time }}</span>
      <span v-if="lastRun" class="badge" :class="lastRun.tone"><AppIcon :name="lastRun.icon" :size="10" />{{ lastRun.text }}</span>
      <button class="btn btn-sm run" type="button" :disabled="busy" @click="emit('run')">
        <span v-if="busy" class="spinner" /><AppIcon v-else name="play" :size="10" />Lancer
      </button>
    </div>
  </article>
</template>

<style scoped>
.routine {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.routine.paused {
  opacity: 0.6;
}

.main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.main .icon-tile {
  width: 44px;
  height: 44px;
}

.text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: none;
  background: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.text strong {
  font-size: 15px;
  font-weight: 800;
}

.chips-row {
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--surface-muted);
  font-size: 12px;
  font-weight: 700;
}

.run {
  margin-left: auto;
}
</style>
