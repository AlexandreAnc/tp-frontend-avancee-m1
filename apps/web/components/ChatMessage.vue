<script setup lang="ts">
import type { ChatMessage } from '#shared/types/events';

const props = defineProps<{ message: ChatMessage; answered?: boolean; agentOnline?: boolean | null }>();
const emit = defineEmits<{ retry: [id: string] }>();

/** Sources citées par l'agent (`nom.pdf`), rendues en liens vers le drive sous la réponse. */
const sources = computed(() => [...new Set(props.message.content.match(/[\w\-À-ÿ]+\.(?:pdf|docx|xlsx|md|txt|jpe?g|png|heic)\b/gi) ?? [])]);
const html = computed(() => renderMarkdown(props.message.content));
</script>

<template>
  <div v-if="message.role === 'user'" class="user" :class="message.status">
    <div class="bubble">{{ message.content }}</div>
    <div class="meta tiny muted strong">
      <template v-if="message.status === 'failed'">
        <span class="failed-label"><AppIcon name="circle-exclamation" :size="11" />Échec · {{ agentOnline === false ? 'agent injoignable' : 'réponse impossible' }}</span>
        <button class="btn btn-sm btn-danger" type="button" @click="emit('retry', message.id)"><AppIcon name="rotate-right" :size="11" />Réessayer</button>
      </template>
      <template v-else-if="message.status === 'queued'"><AppIcon name="clock" :size="10" />{{ agentOnline === false ? 'En attente de l’agent' : 'Envoi…' }}</template>
      <template v-else>{{ formatTime(message.createdAt) }}<span v-if="answered" class="read"><AppIcon name="check-double" :size="10" />Lu</span></template>
    </div>
  </div>

  <div v-else class="assistant">
    <span class="avatar"><AppIcon name="microchip" :size="14" /></span>
    <div class="content">
      <slot name="before" />
      <div class="answer">
        <!-- eslint-disable-next-line vue/no-v-html -- contenu échappé par renderMarkdown -->
        <div class="prose" v-html="html" />
        <div v-if="sources.length" class="sources">
          <NuxtLink v-for="source in sources" :key="source" :to="{ path: '/drive', query: { q: source } }" class="source">
            <AppIcon name="file-pdf" :size="12" />{{ source }}
          </NuxtLink>
        </div>
      </div>
      <slot name="after" />
      <span class="tiny muted strong">{{ formatTime(message.createdAt) }}</span>
    </div>
  </div>
</template>

<style scoped>
.user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-left: 15%;
}

.user .bubble {
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: var(--ink);
  color: var(--on-ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.user.queued .bubble {
  background: color-mix(in srgb, var(--ink) 65%, var(--bg));
}

.user.failed .bubble {
  background: var(--danger-soft);
  color: var(--text);
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.read {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--primary);
}

.failed-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--danger);
}

.assistant {
  display: flex;
  gap: 10px;
  margin-right: 8%;
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--ink);
  color: var(--on-ink);
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.answer {
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.prose :deep(p) {
  margin: 0 0 8px;
  line-height: 22px;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}

.prose :deep(strong) {
  font-weight: 800;
}

.sources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.source {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--info);
  font-size: 12px;
}
</style>
