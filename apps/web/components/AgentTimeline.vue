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

const MARK_TONES: Record<Row['state'], string> = {
  done: 'bg-primary text-white',
  error: 'bg-danger text-white',
  running: 'bg-info-soft text-info',
};

watch(() => props.running, (running) => {
  open.value = running;
}, { immediate: true });
</script>

<template>
  <div v-if="rows.length || running" class="rounded-lg border bg-surface">
    <button class="flex w-full cursor-pointer items-center gap-2 bg-transparent px-3.5 py-3 text-left text-[12px]" type="button" :aria-expanded="open" @click="open = !open">
      <span v-if="running" class="spinner" />
      <AppIcon v-else name="list-check" :size="12" class="text-primary" />
      <strong class="min-w-0 flex-1">{{ rows.length }} étape{{ rows.length > 1 ? 's' : '' }}{{ duration && !running ? ` · ${duration}` : '' }}</strong>
      <AppIcon name="chevron-down" :size="12" class="text-muted [transition:rotate_0.2s]" :class="{ 'rotate-180': open }" />
    </button>
    <ol v-if="open" class="flex list-none flex-col gap-2.5 px-3.5 pb-3.5">
      <li v-for="row in rows" :key="row.key" class="flex gap-2.5 text-xs">
        <span class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full" :class="MARK_TONES[row.state]">
          <span v-if="row.state === 'running'" class="spinner size-2.5 border-[1.5px]" />
          <AppIcon v-else :name="row.state === 'error' ? 'xmark' : 'check'" :size="10" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <strong class="font-bold">{{ row.label }}</strong>
          <span v-if="row.detail" class="text-2xs text-muted">{{ row.detail }}</span>
        </span>
      </li>
      <li v-if="running && thinking?.kind === 'thinking'" class="flex gap-2.5 text-xs">
        <span class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted"><AppIcon name="microchip" :size="10" /></span>
        <span class="line-clamp-3 min-w-0 flex-1 text-2xs text-muted italic">{{ thinking.text }}</span>
      </li>
    </ol>
  </div>
</template>
