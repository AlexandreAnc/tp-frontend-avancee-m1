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
    { label: 'CPU', value: stats.cpu, color: 'var(--primary-bright)' },
    { label: 'RAM', value: stats.ram, color: 'var(--primary-bright)' },
    ...(stats.vram === null ? [] : [{ label: 'VRAM', value: stats.vram, color: 'var(--amber)' }]),
  ];
});
</script>

<template>
  <article class="agent-card">
    <header class="row">
      <span class="chip-tile"><AppIcon name="microchip" :size="14" /></span>
      <h2 class="grow">Agent</h2>
      <span class="status" :class="{ on: online }"><span class="dot" />{{ online ? 'En ligne' : online === false ? 'Hors ligne' : '…' }}</span>
    </header>

    <template v-if="agent">
      <p class="model">{{ agent.chatModel }} · <span>Ollama · {{ agent.name }}</span></p>
      <div v-if="meters.length" class="meters">
        <div v-for="meter in meters" :key="meter.label" class="meter-item">
          <span class="meter-head"><span>{{ meter.label }}</span><strong>{{ meter.value }} %</strong></span>
          <span class="meter"><span :style="{ width: `${meter.value}%`, background: meter.color }" /></span>
        </div>
      </div>
    </template>
    <p v-else class="model off">Votre agent local n'est pas connecté : les demandes attendent son retour.</p>

    <div class="queue">
      <span class="row"><AppIcon name="list-check" :size="12" />File d'attente</span>
      <strong>{{ queueLabel }}</strong>
    </div>
  </article>
</template>

<style scoped>
.agent-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: #1c1f23;
  color: #fff;
}

.chip-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 0.1);
  color: #10b981;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: rgb(255 255 255 / 0.6);
}

.status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status.on {
  color: #10b981;
}

.model {
  font-size: 14px;
  font-weight: 800;
}

.model span {
  font-weight: 400;
  color: rgb(255 255 255 / 0.6);
}

.model.off {
  font-size: 12px;
  font-weight: 600;
  color: rgb(255 255 255 / 0.7);
}

.meters {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.meter-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  line-height: 16px;
  color: rgb(255 255 255 / 0.6);
}

.meter-head strong {
  color: #fff;
}

.meter-item .meter {
  margin-top: 4px;
  background: rgb(255 255 255 / 0.1);
}

.queue {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: rgb(255 255 255 / 0.1);
  font-size: 12px;
  line-height: 16px;
}

.queue .row {
  color: rgb(255 255 255 / 0.6);
  font-weight: 700;
}
</style>
