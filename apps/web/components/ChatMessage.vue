<script setup lang="ts">
import type { ChatMessage } from '#shared/types/events';

const props = defineProps<{ message: ChatMessage; answered?: boolean; agentOnline?: boolean | null }>();
const emit = defineEmits<{ retry: [id: string] }>();

/** Sources citées par l'agent (`nom.pdf`), rendues en liens vers le drive sous la réponse. */
const sources = computed(() => [...new Set(props.message.content.match(/[\w\-À-ÿ]+\.(?:pdf|docx|xlsx|md|txt|jpe?g|png|heic)\b/gi) ?? [])]);
const html = computed(() => renderMarkdown(props.message.content));
const bubbleTone = computed(() => {
  if (props.message.status === 'failed') return 'bg-danger-soft text-text';
  return props.message.status === 'queued' ? 'bg-ink/65 text-on-ink' : 'bg-ink text-on-ink';
});
</script>

<template>
  <div v-if="message.role === 'user'" class="ml-[15%] flex flex-col items-end gap-1">
    <div class="rounded-lg px-4 py-3 whitespace-pre-wrap [word-break:break-word]" :class="bubbleTone">{{ message.content }}</div>
    <div class="flex items-center gap-1.5 text-2xs font-extrabold text-muted">
      <template v-if="message.status === 'failed'">
        <span class="inline-flex items-center gap-1 text-danger"><AppIcon name="circle-exclamation" :size="11" />Échec · {{ agentOnline === false ? 'agent injoignable' : 'réponse impossible' }}</span>
        <button class="btn btn-sm btn-danger" type="button" @click="emit('retry', message.id)"><AppIcon name="rotate-right" :size="11" />Réessayer</button>
      </template>
      <template v-else-if="message.status === 'queued'"><AppIcon name="clock" :size="10" />{{ agentOnline === false ? 'En attente de l’agent' : 'Envoi…' }}</template>
      <template v-else>{{ formatTime(message.createdAt) }}<span v-if="answered" class="inline-flex items-center gap-[3px] text-primary"><AppIcon name="check-double" :size="10" />Lu</span></template>
    </div>
  </div>

  <div v-else class="mr-[8%] flex gap-2.5">
    <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-ink text-on-ink"><AppIcon name="microchip" :size="14" /></span>
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <slot name="before" />
      <div class="rounded-lg border bg-surface p-[15px]">
        <!-- eslint-disable-next-line vue/no-v-html -- contenu échappé par renderMarkdown -->
        <div class="prose" v-html="html" />
        <div v-if="sources.length" class="mt-3 flex flex-wrap gap-2">
          <NuxtLink v-for="source in sources" :key="source" :to="{ path: '/drive', query: { q: source } }" class="inline-flex items-center gap-1.5 text-[12px] text-info">
            <AppIcon name="file-pdf" :size="12" />{{ source }}
          </NuxtLink>
        </div>
      </div>
      <slot name="after" />
      <span class="text-2xs font-extrabold text-muted">{{ formatTime(message.createdAt) }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Markdown de la réponse, injecté via v-html : listes rétablies après le preflight de Tailwind. */
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
  list-style: disc;
}

.prose :deep(ol) {
  list-style: decimal;
}

.prose :deep(strong) {
  font-weight: 800;
}
</style>
