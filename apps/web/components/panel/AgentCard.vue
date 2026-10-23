<script setup lang="ts">
import type { AgentSummary } from '#shared/types/events';

const props = defineProps<{
  online: boolean | null;
  agent: AgentSummary | null;
  queue: { messages: number; files: number; nextFileName: string | null } | null;
}>();

const queueLabel = computed(() => {
  const queue = props.queue;
  if (!queue || queue.messages + queue.files === 0) return 'Vide';
  const total = queue.messages + queue.files;
  const detail = queue.files ? `analyse ${queue.nextFileName ?? 'd’un document'}` : 'question en attente';
  return `${total} tâche${total > 1 ? 's' : ''} · ${detail}`;
});

const meters = computed(() => {
  const stats = props.agent?.stats;
  if (!stats) return [];
  return [
    { label: 'CPU', value: stats.cpu, color: 'var(--color-primary-bright)' },
    { label: 'RAM', value: stats.ram, color: 'var(--color-primary-bright)' },
    ...(stats.vram === null ? [] : [{ label: 'VRAM', value: stats.vram, color: 'var(--color-amber)' }]),
  ];
});
</script>

<template>
  <article class="flex flex-col gap-3 rounded-lg bg-night p-4 text-white">
    <header class="flex items-center gap-2">
      <span class="inline-flex size-7 items-center justify-center rounded-sm bg-white/10 text-emerald"><AppIcon name="microchip" :size="14" /></span>
      <h2 class="min-w-0 flex-1">Agent</h2>
      <span class="inline-flex items-center gap-1.5 text-[11px] font-bold" :class="online ? 'text-emerald' : 'text-white/60'"><span class="size-1.5 rounded-full bg-current" />{{ online ? 'En ligne' : online === false ? 'Hors ligne' : '…' }}</span>
    </header>

    <template v-if="agent">
      <p class="text-[14px] font-extrabold">{{ agent.chatModel }} · <span class="font-normal text-white/60">Ollama · {{ agent.name }}</span></p>
      <div v-if="meters.length" class="grid grid-cols-[repeat(3,1fr)] gap-3">
        <div v-for="meter in meters" :key="meter.label">
          <span class="flex justify-between text-[11px] leading-4 text-white/60"><span>{{ meter.label }}</span><strong class="text-white">{{ meter.value }} %</strong></span>
          <span class="meter mt-1 bg-white/10"><span :style="{ width: `${meter.value}%`, background: meter.color }" /></span>
        </div>
      </div>
    </template>
    <p v-else class="text-[12px] font-semibold text-white/70">Votre agent local n'est pas connecté : les demandes attendent son retour.</p>

    <div class="flex items-center justify-between gap-2 rounded-md bg-white/10 px-3 py-2.5 text-xs">
      <span class="flex items-center gap-2 font-bold text-white/60"><AppIcon name="list-check" :size="12" />File d'attente</span>
      <strong>{{ queueLabel }}</strong>
    </div>
  </article>
</template>
