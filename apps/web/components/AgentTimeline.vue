<script setup lang="ts">
import { SPECIALISTS, type AgentStep, type SpecialistName } from '@app/shared';
import type { IconName } from '~/utils/icons';

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
  move_file: 'Rangement du document',
  create_calendar_event: 'Préparation de l’événement',
  create_reminder: 'Création du rappel',
  get_agenda: 'Lecture du planning',
  get_home: 'État de la maison',
  control_lights: 'Commande des lumières',
  activate_scene: 'Activation de la scène',
  list_routines: 'Liste des routines',
  run_routine: 'Lancement de la routine',
};

const SPECIALIST_VISUALS: Record<SpecialistName, { icon: IconName; tone: string }> = {
  documents: { icon: 'folder', tone: 'tone-info' },
  planning: { icon: 'calendar', tone: 'tone-warning' },
  home: { icon: 'lightbulb', tone: 'tone-primary' },
};

type State = 'done' | 'error' | 'running';

interface ToolRow {
  key: number;
  label: string;
  detail: string | null;
  state: State;
}

/** Une délégation de l'orchestrateur : la consigne, les outils du spécialiste, son compte rendu. */
interface DelegationRow {
  key: number;
  specialist: SpecialistName;
  task: string;
  answer: string | null;
  error: string | null;
  state: State;
  tools: ToolRow[];
}

type Row = { type: 'tool'; row: ToolRow } | { type: 'delegation'; row: DelegationRow };

/** Résultat d'un appel : même `callId` (multi-agents) ou, pour les anciennes étapes, prochain résultat du même outil. */
function resultOf(index: number): Extract<AgentStep, { kind: 'tool_result' }> | undefined {
  const call = props.steps[index]!.step as Extract<AgentStep, { kind: 'tool_call' }>;
  const match = props.steps.slice(index + 1).find(({ step }) => step.kind === 'tool_result' && step.tool === call.tool && step.callId === call.callId)?.step;
  return match?.kind === 'tool_result' ? match : undefined;
}

function toolRow(index: number): ToolRow {
  const entry = props.steps[index]!;
  const step = entry.step as Extract<AgentStep, { kind: 'tool_call' }>;
  const result = resultOf(index);
  const input = step.input as Record<string, unknown> | null;
  const query = typeof input?.query === 'string' ? `« ${input.query} »` : typeof input?.text === 'string' ? `« ${input.text} »` : null;
  return {
    key: entry.position,
    label: TOOL_LABELS[step.tool] ?? step.tool,
    detail: result ? (result.error ?? ([query, summarize(result.output)].filter(Boolean).join(' · ') || null)) : query,
    state: !result ? 'running' : result.error ? 'error' : 'done',
  };
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  const delegations = new Map<string, DelegationRow>();
  for (const [index, { step, position }] of props.steps.entries()) {
    if (step.kind === 'delegation') {
      const row: DelegationRow = { key: position, specialist: step.specialist, task: step.task, answer: null, error: null, state: 'running', tools: [] };
      delegations.set(step.callId, row);
      list.push({ type: 'delegation', row });
    } else if (step.kind === 'delegation_result') {
      const row = delegations.get(step.callId);
      // Aperçu du compte rendu : texte brut, le Markdown est réservé à la réponse finale.
      if (row) Object.assign(row, { answer: step.answer?.replace(/[*_`#]+/g, '') ?? null, error: step.error ?? null, state: step.error ? 'error' : 'done' });
    } else if (step.kind === 'tool_call') {
      const parent = step.parentId ? delegations.get(step.parentId) : undefined;
      if (parent) parent.tools.push(toolRow(index));
      else list.push({ type: 'tool', row: toolRow(index) });
    } else if (step.kind === 'tool_result' && !step.parentId && !props.steps.some(({ step: other }) => other.kind === 'tool_call' && other.callId === step.callId && other.tool === step.tool)) {
      // Délégation refusée (spécialiste inconnu) : pas d'appel correspondant, juste l'erreur.
      list.push({ type: 'tool', row: { key: position, label: step.tool, detail: step.error ?? null, state: 'error' } });
    }
  }
  return list;
});

function summarize(output: unknown): string | null {
  const value = output as { results?: unknown[]; files?: unknown[]; items?: unknown[]; rooms?: unknown[]; routines?: unknown[]; name?: string; totalLength?: number; status?: string } | null;
  if (Array.isArray(value?.results)) return `${value.results.length} résultat${value.results.length > 1 ? 's' : ''}`;
  if (Array.isArray(value?.files)) return `${value.files.length} document${value.files.length > 1 ? 's' : ''}`;
  if (Array.isArray(value?.items)) return `${value.items.length} élément${value.items.length > 1 ? 's' : ''}`;
  if (Array.isArray(value?.rooms)) return `${value.rooms.length} pièce${value.rooms.length > 1 ? 's' : ''}`;
  if (Array.isArray(value?.routines)) return `${value.routines.length} routine${value.routines.length > 1 ? 's' : ''}`;
  if (value?.name) return value.name;
  if (value?.status === 'pending') return 'en attente de votre validation';
  if (value?.status === 'executed' || value?.status === 'success') return 'fait';
  return null;
}

const stepCount = computed(() => rows.value.reduce((count, entry) => count + (entry.type === 'tool' ? 1 : entry.row.tools.length), 0));
const specialistCount = computed(() => new Set(rows.value.flatMap((entry) => (entry.type === 'delegation' ? [entry.row.specialist] : []))).size);
const title = computed(() => {
  const parts = [`${stepCount.value} étape${stepCount.value > 1 ? 's' : ''}`];
  if (specialistCount.value) parts.unshift(`${specialistCount.value} spécialiste${specialistCount.value > 1 ? 's' : ''}`);
  if (duration.value && !props.running) parts.push(duration.value);
  return parts.join(' · ');
});

const thinking = computed(() => {
  const step = [...props.steps].reverse().find((entry) => entry.step.kind === 'thinking')?.step;
  return step?.kind === 'thinking' ? step : undefined;
});
const thinkingAuthor = computed(() => {
  const agent = thinking.value?.agent;
  return agent && agent !== 'orchestrator' ? SPECIALISTS[agent].label : 'Orchestrateur';
});
const duration = computed(() => {
  if (props.steps.length < 2) return null;
  const seconds = (new Date(props.steps.at(-1)!.at).getTime() - new Date(props.steps[0]!.at).getTime()) / 1000;
  return `${seconds.toFixed(1).replace('.', ',')} s`;
});

const MARK_TONES: Record<State, string> = {
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
      <AppIcon v-else :name="specialistCount ? 'sitemap' : 'list-check'" :size="12" class="text-primary" />
      <strong class="min-w-0 flex-1">{{ title }}</strong>
      <AppIcon name="chevron-down" :size="12" class="text-muted [transition:rotate_0.2s]" :class="{ 'rotate-180': open }" />
    </button>
    <ol v-if="open" class="flex list-none flex-col gap-2.5 px-3.5 pb-3.5">
      <template v-for="entry in rows" :key="entry.row.key">
        <li v-if="entry.type === 'tool'" class="flex gap-2.5 text-xs">
          <span class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full" :class="MARK_TONES[entry.row.state]">
            <span v-if="entry.row.state === 'running'" class="spinner size-2.5 border-[1.5px]" />
            <AppIcon v-else :name="entry.row.state === 'error' ? 'xmark' : 'check'" :size="10" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <strong class="font-bold">{{ entry.row.label }}</strong>
            <span v-if="entry.row.detail" class="text-2xs text-muted">{{ entry.row.detail }}</span>
          </span>
        </li>
        <li v-else class="flex flex-col gap-2 text-xs">
          <div class="flex gap-2.5">
            <span class="icon-tile size-[18px] rounded-xs" :class="SPECIALIST_VISUALS[entry.row.specialist].tone">
              <AppIcon :name="SPECIALIST_VISUALS[entry.row.specialist].icon" :size="10" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="flex items-center gap-1.5">
                <strong class="font-bold">{{ SPECIALISTS[entry.row.specialist].label }}</strong>
                <span v-if="entry.row.state === 'running'" class="spinner size-2.5 border-[1.5px] text-info" />
                <AppIcon v-else-if="entry.row.state === 'error'" name="xmark" :size="10" class="text-danger" />
              </span>
              <span class="text-2xs text-muted">{{ entry.row.task }}</span>
            </span>
          </div>
          <ol v-if="entry.row.tools.length || entry.row.answer || entry.row.error" class="ml-[8.5px] flex list-none flex-col gap-2 border-l pl-4">
            <li v-for="tool in entry.row.tools" :key="tool.key" class="flex gap-2.5">
              <span class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full" :class="MARK_TONES[tool.state]">
                <span v-if="tool.state === 'running'" class="spinner size-2.5 border-[1.5px]" />
                <AppIcon v-else :name="tool.state === 'error' ? 'xmark' : 'check'" :size="10" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <strong class="font-bold">{{ tool.label }}</strong>
                <span v-if="tool.detail" class="text-2xs text-muted">{{ tool.detail }}</span>
              </span>
            </li>
            <li v-if="entry.row.answer || entry.row.error" class="line-clamp-3 text-2xs" :class="entry.row.error ? 'text-danger' : 'text-muted italic'">
              {{ entry.row.error ?? `« ${entry.row.answer} »` }}
            </li>
          </ol>
        </li>
      </template>
      <li v-if="running && thinking" class="flex gap-2.5 text-xs">
        <span class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted"><AppIcon name="microchip" :size="10" /></span>
        <span class="line-clamp-3 min-w-0 flex-1 text-2xs text-muted italic"><strong class="font-bold not-italic">{{ thinkingAuthor }} · </strong>{{ thinking.text }}</span>
      </li>
    </ol>
  </div>
</template>
