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
</script>

<template>
  <section class="result" :class="run.status">
    <header class="head">
      <span class="status-icon"><AppIcon :name="run.status === 'success' ? 'check' : run.status === 'partial' ? 'circle-half' : 'xmark'" :size="16" /></span>
      <div class="grow">
        <h2>« {{ name }} » {{ title }}</h2>
        <p class="small muted">{{ formatTime(run.createdAt) }} · {{ done }}/{{ run.steps.length }} étapes · {{ seconds(run.durationMs) }}</p>
      </div>
    </header>
    <ul class="steps">
      <li v-for="step in run.steps" :key="step.label" :class="step.status">
        <span class="mark"><AppIcon :name="step.status === 'failed' ? 'xmark' : step.status === 'queued' ? 'clock' : 'check'" :size="10" /></span>
        <span class="grow">
          <strong>{{ step.label }}</strong>
          <span v-if="step.error" class="small error">{{ step.error }}</span>
          <span v-else-if="step.status === 'queued'" class="small muted">Transmis à l'agent</span>
        </span>
        <span class="small muted">{{ seconds(step.durationMs) }}</span>
      </li>
    </ul>
    <button v-if="run.status !== 'success'" class="btn btn-sm btn-danger retry" type="button" @click="emit('retry')"><AppIcon name="rotate-right" :size="12" />Relancer</button>
    <div class="buttons">
      <button class="btn" type="button" @click="emit('edit')">Modifier la routine</button>
      <NuxtLink :to="openUrl ?? '/journal'" class="btn btn-ink">{{ openUrl ? 'Voir la réponse' : 'Voir le journal' }}</NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.result {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--primary-soft);
}

.partial .head {
  background: var(--warning-soft);
}

.failed .head {
  background: var(--danger-soft);
}

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
}

.partial .status-icon {
  background: var(--amber);
}

.failed .status-icon {
  background: var(--danger);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.steps li {
  display: flex;
  gap: 10px;
}

.steps .grow {
  display: flex;
  flex-direction: column;
}

.steps strong {
  font-weight: 700;
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
}

.failed .mark,
li.failed .mark {
  background: var(--danger);
}

li.queued .mark {
  background: var(--info);
}

li.success .mark {
  background: var(--primary);
}

.error {
  color: var(--danger);
}

.retry {
  margin: 0 16px 16px;
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 16px 16px;
}
</style>
