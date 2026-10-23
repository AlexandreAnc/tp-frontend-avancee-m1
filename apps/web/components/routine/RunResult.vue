<script setup lang="ts">
import type { RoutineStepResult } from '@app/shared';

const props = defineProps<{
  name: string;
  run: { status: 'success' | 'partial' | 'failed'; steps: RoutineStepResult[]; durationMs: number; createdAt: string };
}>();
const emit = defineEmits<{ retry: []; edit: [] }>();

const done = computed(() => props.run.steps.filter((step) => step.status !== 'failed').length);
const title = computed(() => ({ success: 'exécutée', partial: 'exécutée en partie', failed: 'a échoué' })[props.run.status]);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const openUrl = computed(() => props.run.steps.find((step) => step.openUrl)?.openUrl ?? null);
const HEAD_TONES = { success: 'bg-primary-soft', partial: 'bg-warning-soft', failed: 'bg-danger-soft' } as const;
const ICON_TONES = { success: 'bg-primary', partial: 'bg-amber', failed: 'bg-danger' } as const;
const MARK_TONES = { success: 'bg-primary', queued: 'bg-info', failed: 'bg-danger' } as const;
</script>

<template>
  <section class="overflow-hidden rounded-lg border bg-surface">
    <header class="flex items-center gap-3 p-4" :class="HEAD_TONES[run.status]">
      <span class="inline-flex size-11 items-center justify-center rounded-full text-white" :class="ICON_TONES[run.status]"><AppIcon :name="run.status === 'success' ? 'check' : run.status === 'partial' ? 'circle-half' : 'xmark'" :size="16" /></span>
      <div class="min-w-0 flex-1">
        <h2>« {{ name }} » {{ title }}</h2>
        <p class="text-xs text-muted">{{ formatTime(run.createdAt) }} · {{ done }}/{{ run.steps.length }} étapes · {{ seconds(run.durationMs) }}</p>
      </div>
    </header>
    <ul class="flex flex-col gap-3.5 p-4">
      <li v-for="step in run.steps" :key="step.label" class="flex gap-2.5">
        <span class="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-white" :class="MARK_TONES[step.status]"><AppIcon :name="step.status === 'failed' ? 'xmark' : step.status === 'queued' ? 'clock' : 'check'" :size="10" /></span>
        <span class="flex min-w-0 flex-1 flex-col">
          <strong class="font-bold">{{ step.label }}</strong>
          <span v-if="step.error" class="text-xs text-danger">{{ step.error }}</span>
          <span v-else-if="step.status === 'queued'" class="text-xs text-muted">Transmis à l'agent</span>
        </span>
        <span class="text-xs text-muted">{{ seconds(step.durationMs) }}</span>
      </li>
    </ul>
    <button v-if="run.status !== 'success'" class="btn btn-sm btn-danger mx-4 mb-4" type="button" @click="emit('retry')"><AppIcon name="rotate-right" :size="12" />Relancer</button>
    <div class="grid grid-cols-[1fr_1fr] gap-2 px-4 pb-4">
      <button class="btn" type="button" @click="emit('edit')">Modifier la routine</button>
      <NuxtLink :to="openUrl ?? '/journal'" class="btn btn-ink">{{ openUrl ? 'Voir la réponse' : 'Voir le journal' }}</NuxtLink>
    </div>
  </section>
</template>
