<script setup lang="ts">
import type { AgentStep } from '@app/shared';

export interface TimelineStep {
  position: number;
  step: AgentStep;
  at: string;
}

const props = defineProps<{ steps: TimelineStep[]; running: boolean }>();
const open = ref(false);

const TOOL_LABELS: Record<string, string> = {
  list_files: 'Liste des documents',
  read_file: 'Lecture du document',
  semantic_search: 'Recherche dans le Drive',
  exact_search: 'Recherche exacte',
  create_calendar_event: 'Préparation de l’événement',
  create_reminder: 'Création du rappel',
  get_agenda: 'Lecture du planning',
};

interface Row {
  key: number;
  label: string;
  detail: string | null;
  state: 'done' | 'error' | 'running';
}

/** Une ligne par appel d'outil (avec son résultat), plus la réflexion en cours. */
const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  for (const [index, entry] of props.steps.entries()) {
    const step = entry.step;
    if (step.kind !== 'tool_call') continue;
    const result = props.steps.slice(index + 1).find((next) => next.step.kind === 'tool_result' && next.step.tool === step.tool)?.step;
    const input = step.input as Record<string, unknown> | null;
    const query = typeof input?.query === 'string' ? `« ${input.query} »` : typeof input?.text === 'string' ? `« ${input.text} »` : null;
    list.push({
      key: entry.position,
      label: TOOL_LABELS[step.tool] ?? step.tool,
      detail: result?.kind === 'tool_result' ? (result.error ?? [query, summarize(result.output)].filter(Boolean).join(' · ')) : query,
      state: !result ? 'running' : result.kind === 'tool_result' && result.error ? 'error' : 'done',
    });
  }
  return list;
});

function summarize(output: unknown): string | null {
  const value = output as { results?: unknown[]; files?: unknown[]; items?: unknown[]; name?: string; totalLength?: number; status?: string } | null;
  if (Array.isArray(value?.results)) return `${value.results.length} résultat${value.results.length > 1 ? 's' : ''}`;
  if (Array.isArray(value?.files)) return `${value.files.length} document${value.files.length > 1 ? 's' : ''}`;
  if (Array.isArray(value?.items)) return `${value.items.length} élément${value.items.length > 1 ? 's' : ''}`;
  if (value?.name) return value.name;
  if (value?.status === 'pending') return 'en attente de votre validation';
  if (value?.status === 'executed') return 'fait';
  return null;
}

const thinking = computed(() => [...props.steps].reverse().find((entry) => entry.step.kind === 'thinking')?.step);
const duration = computed(() => {
  if (props.steps.length < 2) return null;
  const seconds = (new Date(props.steps.at(-1)!.at).getTime() - new Date(props.steps[0]!.at).getTime()) / 1000;
  return `${seconds.toFixed(1).replace('.', ',')} s`;
});

watch(() => props.running, (running) => {
  open.value = running;
}, { immediate: true });
</script>

<template>
  <div v-if="rows.length || running" class="steps-card">
    <button class="head" type="button" :aria-expanded="open" @click="open = !open">
      <span v-if="running" class="spinner" />
      <AppIcon v-else name="list-check" :size="12" class="ok" />
      <strong class="grow">{{ rows.length }} étape{{ rows.length > 1 ? 's' : '' }}{{ duration && !running ? ` · ${duration}` : '' }}</strong>
      <AppIcon name="chevron-down" :size="12" class="chevron" :class="{ open }" />
    </button>
    <ol v-if="open" class="rows">
      <li v-for="row in rows" :key="row.key" :class="row.state">
        <span class="mark">
          <span v-if="row.state === 'running'" class="spinner" />
          <AppIcon v-else :name="row.state === 'error' ? 'xmark' : 'check'" :size="10" />
        </span>
        <span class="grow">
          <strong>{{ row.label }}</strong>
          <span v-if="row.detail" class="tiny muted">{{ row.detail }}</span>
        </span>
      </li>
      <li v-if="running && thinking?.kind === 'thinking'" class="thinking">
        <span class="mark"><AppIcon name="microchip" :size="10" /></span>
        <span class="tiny muted grow">{{ thinking.text }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.steps-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: none;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.ok {
  color: var(--primary);
}

.chevron {
  color: var(--text-muted);
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rows li {
  display: flex;
  gap: 10px;
  font-size: 12px;
  line-height: 16px;
}

.rows .grow {
  display: flex;
  flex-direction: column;
}

.rows strong {
  font-weight: 700;
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
}

.running .mark {
  background: var(--info-soft);
  color: var(--info);
}

.error .mark {
  background: var(--danger);
}

.thinking .mark {
  background: var(--surface-muted);
  color: var(--text-muted);
}

.thinking .tiny {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-style: italic;
}

.mark .spinner {
  width: 10px;
  height: 10px;
  border-width: 1.5px;
}
</style>
