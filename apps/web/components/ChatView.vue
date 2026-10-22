<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';
import type { ChatMessage } from '#shared/types/events';
import type { TimelineStep } from './AgentTimeline.vue';

const props = defineProps<{ conversationId: string | null }>();

const route = useRoute();
const { online, agent } = useAgentStatus();
const { ask } = useConfirm();
const { data: list, refresh: refreshList } = await useFetch('/api/conversations', { key: 'conversations' });
const conversation = ref<ApiResponse<'/api/conversations/:id', 'get'>['conversation'] | null>(null);
const loadError = ref<unknown>(null);
const messages = ref<ChatMessage[]>([]);
const steps = ref<Record<string, TimelineStep[]>>({});
const draft = ref(typeof route.query.prompt === 'string' ? route.query.prompt : '');
const error = ref<string | null>(null);
const sending = ref(false);
const scroller = ref<HTMLElement | null>(null);

async function load() {
  if (!props.conversationId) {
    conversation.value = null;
    messages.value = [];
    steps.value = {};
    return;
  }
  try {
    const data = await $fetch<ApiResponse<'/api/conversations/:id', 'get'>>(`/api/conversations/${props.conversationId}`);
    conversation.value = data.conversation;
    messages.value = data.conversation.messages;
    steps.value = data.conversation.steps;
    loadError.value = null;
    void scrollToBottom('instant');
  } catch (caught) {
    loadError.value = caught;
  }
}

await load();
watch(() => props.conversationId, load);

useHead(() => ({ title: `${conversation.value?.title ?? 'Discussions'} · DashIA` }));

const replies = computed(() => new Map(messages.value.filter((message) => message.replyToId).map((message) => [message.replyToId!, message])));

interface InlineActionInfo {
  output: { status: 'pending'; actionId: string } | { status: 'executed'; activityId: string };
  summary: string;
}

/** Actions demandées par l'agent pendant le traitement d'un message (résultats des outils d'action). */
function actionsFor(messageId: string): InlineActionInfo[] {
  return (steps.value[messageId] ?? []).flatMap(({ step }) => {
    if (step.kind !== 'tool_result' || step.error || !['create_calendar_event', 'create_reminder'].includes(step.tool)) return [];
    const output = step.output as InlineActionInfo['output'];
    const call = (steps.value[messageId] ?? []).find((entry) => entry.step.kind === 'tool_call' && entry.step.tool === step.tool)?.step;
    const input = call?.kind === 'tool_call' ? call.input as { title?: string; text?: string } : {};
    const label = input.title ?? input.text ?? '';
    return [{ output, summary: step.tool === 'create_reminder' ? `Rappel « ${label} »` : `Événement « ${label} »` }];
  });
}

/** Séparateur de jour (« Aujourd'hui · 08:38 ») avant le premier message de chaque jour. */
function dayLabel(index: number): string | null {
  const message = messages.value[index]!;
  const previous = messages.value[index - 1];
  if (previous && new Date(previous.createdAt).toDateString() === new Date(message.createdAt).toDateString()) return null;
  const days = daysUntil(message.createdAt);
  const day = days === 0 ? 'Aujourd’hui' : days === -1 ? 'Hier' : formatDayLong(message.createdAt);
  return `${day} · ${formatTime(message.createdAt)}`;
}

const lastUserMessage = computed(() => [...messages.value].reverse().find((message) => message.role === 'user'));
const typing = computed(() => lastUserMessage.value?.status === 'processing' && !replies.value.has(lastUserMessage.value.id));

async function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior });
}

useEvents((event) => {
  if (event.type === 'message.created' && !props.conversationId) return;
  if (!('conversationId' in event) || event.conversationId !== props.conversationId) return;
  if (event.type === 'message.created' && !messages.value.some((message) => message.id === event.message.id)) {
    messages.value.push(event.message);
  } else if (event.type === 'message.status') {
    const message = messages.value.find((candidate) => candidate.id === event.messageId);
    if (message) message.status = event.status;
    if (event.status === 'processing') steps.value[event.messageId] = [];
  } else if (event.type === 'agent.step') {
    const entries = (steps.value[event.messageId] ??= []);
    if (!entries.some((entry) => entry.position === event.position)) entries.push({ position: event.position, step: event.step, at: event.at });
  }
  void scrollToBottom();
});

async function send(content: string) {
  error.value = null;
  sending.value = true;
  try {
    if (!props.conversationId) {
      const { conversationId } = await $fetch('/api/conversations', { method: 'POST', body: { content } });
      await refreshList();
      await navigateTo(`/chat/${conversationId}`);
      return;
    }
    const { message } = await $fetch<ApiResponse<'/api/conversations/:id/messages', 'post'>>(`/api/conversations/${props.conversationId}/messages`, { method: 'POST', body: { content } });
    if (!messages.value.some((candidate) => candidate.id === message.id)) messages.value.push(message);
    void scrollToBottom();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    sending.value = false;
  }
}

async function retry(messageId: string) {
  error.value = null;
  try {
    await $fetch(`/api/messages/${messageId}/retry`, { method: 'POST' });
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

async function remove() {
  if (!props.conversationId || !await ask({ title: 'Supprimer cette discussion ?', confirm: 'Supprimer', danger: true })) return;
  await $fetch(`/api/conversations/${props.conversationId}`, { method: 'DELETE' });
  await refreshList();
  await navigateTo('/chat');
}

const SUGGESTIONS = ['Mon résumé du jour', 'Quelles sont mes prochaines échéances ?', 'Chercher un document'];
</script>

<template>
  <div class="chat-page">
    <PageHeader title="Discussions" :sticky="true">
      <template #subtitle>
        <span class="model" :class="{ on: online }"><span class="dot" />{{ agent ? `${agent.chatModel} · local` : online === false ? 'Agent hors ligne' : 'Agent local' }}</span>
      </template>
      <template #actions>
        <button v-if="conversationId" class="icon-btn" type="button" aria-label="Supprimer la discussion" @click="remove"><AppIcon name="trash" /></button>
        <NuxtLink to="/chat" class="icon-btn tone-ink-btn" aria-label="Nouvelle discussion"><AppIcon name="pen-to-square" /></NuxtLink>
      </template>
      <template v-if="list?.conversations.length" #below>
        <div class="chips">
          <NuxtLink v-for="item in list.conversations" :key="item.id" :to="`/chat/${item.id}`" class="chip" :class="{ active: item.id === conversationId }">
            {{ item.title }}
          </NuxtLink>
        </div>
      </template>
    </PageHeader>

    <div ref="scroller" class="messages" aria-live="polite">
      <div class="thread">
        <p v-if="loadError" class="alert alert-error">{{ getErrorMessage(loadError, 'Discussion introuvable.') }}</p>

        <div v-if="!conversationId" class="intro">
          <BrandLogo :size="56" :online="Boolean(online)" />
          <h2>Que puis-je faire pour vous ?</h2>
          <p class="muted small">Je fouille vos documents, consulte votre planning et prépare des actions que vous validez.</p>
        </div>

        <template v-for="(message, index) in messages" :key="message.id">
          <p v-if="dayLabel(index)" class="day tiny muted strong">{{ dayLabel(index) }}</p>
          <ChatMessage v-if="message.role === 'user'" :message="message" :answered="replies.has(message.id)" :agent-online="online" @retry="retry" />
          <template v-if="message.role === 'user' && !replies.has(message.id) && (steps[message.id]?.length || message.status === 'processing')">
            <div class="agent-pending">
              <span class="avatar"><AppIcon name="microchip" :size="14" /></span>
              <AgentTimeline class="grow" :steps="steps[message.id] ?? []" :running="message.status === 'processing'" />
            </div>
          </template>
          <ChatMessage v-if="message.role === 'assistant'" :message="message">
            <template #before>
              <AgentTimeline v-if="message.replyToId && steps[message.replyToId]?.length" :steps="steps[message.replyToId]!" :running="false" />
            </template>
            <template #after>
              <InlineAction v-for="info in actionsFor(message.replyToId ?? '')" :key="JSON.stringify(info.output)" :output="info.output" :summary="info.summary" />
            </template>
          </ChatMessage>
        </template>

        <div v-if="typing" class="agent-pending">
          <span class="avatar"><AppIcon name="microchip" :size="14" /></span>
          <span class="typing"><span /><span /><span /> Rédaction de la réponse…</span>
        </div>
      </div>
    </div>

    <footer class="composer-bar">
      <div class="thread">
        <p v-if="lastUserMessage?.status === 'queued' && online === false" class="alert alert-warning">
          <AppIcon name="plug-xmark" :size="14" />Votre agent local est hors ligne : la demande sera traitée dès sa reconnexion.
        </p>
        <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
        <ChatComposer v-model="draft" :disabled="sending" :suggestions="messages.length ? [] : SUGGESTIONS" @send="send" />
      </div>
    </footer>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--nav-height) - env(safe-area-inset-bottom));
}

.model {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.model .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.model.on {
  color: var(--primary);
}

.tone-ink-btn {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--on-ink);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.thread {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;
}

.intro h2 {
  margin-top: 12px;
  font-size: 18px;
}

.day {
  text-align: center;
}

.agent-pending {
  display: flex;
  align-items: flex-start;
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

.typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: blink 1.2s infinite;
}

.typing span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing span:nth-child(3) {
  animation-delay: 0.4s;
  margin-right: 4px;
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

.composer-bar {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}

.composer-bar .thread {
  gap: 8px;
}

@media (min-width: 1024px) {
  .chat-page {
    height: 100dvh;
  }
}
</style>
