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
/** Réponse en cours d'écriture, par message utilisateur : affichée mot à mot, remplacée par la réponse enregistrée. */
const answerDrafts = ref<Record<string, string>>({});
const draft = ref(typeof route.query.prompt === 'string' ? route.query.prompt : '');
const error = ref<string | null>(null);
const sending = ref(false);
const scroller = ref<HTMLElement | null>(null);
const outbox = useOutbox();
/** Messages écrits hors ligne pour cette discussion, pas encore envoyés. */
const queued = computed(() => outbox.entries.value.filter((entry) => entry.conversationId === props.conversationId));

async function load() {
  if (!props.conversationId) {
    conversation.value = null;
    messages.value = [];
    steps.value = {};
    answerDrafts.value = {};
    return;
  }
  try {
    const data = await $fetch<ApiResponse<'/api/conversations/:id', 'get'>>(`/api/conversations/${props.conversationId}`);
    conversation.value = data.conversation;
    messages.value = data.conversation.messages;
    steps.value = data.conversation.steps;
    answerDrafts.value = {};
    loadError.value = null;
    void scrollToBottom('instant');
  } catch (caught) {
    loadError.value = caught;
  }
}

await load();
watch(() => props.conversationId, load);
// Un message de la file vient de partir : on recharge la discussion (le flux d'événements a pu manquer sa création).
watch(() => queued.value.length, (count, previous) => {
  if (count < previous) void load();
});

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
    const call = (steps.value[messageId] ?? []).find((entry) => entry.step.kind === 'tool_call' && entry.step.tool === step.tool && entry.step.callId === step.callId)?.step;
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
const typing = computed(() => lastUserMessage.value?.status === 'processing' && !replies.value.has(lastUserMessage.value.id) && !answerDrafts.value[lastUserMessage.value.id]);

/** Brouillon affiché comme une réponse de l'agent (même rendu Markdown), tant que la vraie n'est pas arrivée. */
function draftMessage(message: ChatMessage): ChatMessage | null {
  const text = answerDrafts.value[message.id];
  if (!text || replies.value.has(message.id) || message.status !== 'processing') return null;
  return { id: `draft-${message.id}`, role: 'assistant', content: text, status: null, replyToId: message.id, createdAt: message.createdAt };
}

async function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior });
}

useEvents((event) => {
  if (event.type === 'message.created' && !props.conversationId) return;
  if (!('conversationId' in event) || event.conversationId !== props.conversationId) return;
  if (event.type === 'message.created' && !messages.value.some((message) => message.id === event.message.id)) {
    messages.value.push(event.message);
    if (event.message.replyToId) delete answerDrafts.value[event.message.replyToId];
  } else if (event.type === 'message.draft') {
    answerDrafts.value[event.messageId] = event.text;
  } else if (event.type === 'message.status') {
    const message = messages.value.find((candidate) => candidate.id === event.messageId);
    if (message) message.status = event.status;
    if (event.status === 'processing') steps.value[event.messageId] = [];
    if (event.status !== 'processing') delete answerDrafts.value[event.messageId];
  } else if (event.type === 'agent.step') {
    const entries = (steps.value[event.messageId] ??= []);
    if (!entries.some((entry) => entry.position === event.position)) entries.push({ position: event.position, step: event.step, at: event.at });
  }
  void scrollToBottom();
});

function queue(content: string) {
  outbox.enqueue(props.conversationId, content);
  void scrollToBottom();
}

async function send(content: string) {
  error.value = null;
  if (!navigator.onLine) {
    queue(content);
    return;
  }
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
    // Coupure pendant l'envoi : le message rejoint la file plutôt que d'être perdu.
    if (isNetworkError(caught)) queue(content);
    else error.value = getErrorMessage(caught);
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
  <div class="flex h-[calc(100dvh_-_var(--nav-height)_-_env(safe-area-inset-bottom))] flex-col lg:h-dvh">
    <PageHeader title="Discussions" :sticky="true">
      <template #subtitle>
        <span class="inline-flex items-center gap-[5px]" :class="{ 'text-primary': online }"><span class="size-1.5 rounded-full bg-current" />{{ agent ? `${agent.chatModel} · local` : online === false ? 'Agent hors ligne' : 'Agent local' }}</span>
      </template>
      <template #actions>
        <button v-if="conversationId" class="icon-btn" type="button" aria-label="Supprimer la discussion" @click="remove"><AppIcon name="trash" /></button>
        <NuxtLink to="/chat" class="icon-btn border-ink bg-ink text-on-ink" aria-label="Nouvelle discussion"><AppIcon name="pen-to-square" /></NuxtLink>
      </template>
      <template v-if="list?.conversations.length" #below>
        <div class="chips">
          <NuxtLink v-for="item in list.conversations" :key="item.id" :to="`/chat/${item.id}`" class="chip" :class="{ active: item.id === conversationId }">
            {{ item.title }}
          </NuxtLink>
        </div>
      </template>
    </PageHeader>

    <div ref="scroller" class="flex-1 overflow-y-auto p-4" aria-live="polite">
      <div class="mx-auto flex w-full max-w-[760px] flex-col gap-3.5">
        <p v-if="loadError" class="alert alert-error">{{ getErrorMessage(loadError, 'Discussion introuvable.') }}</p>

        <div v-if="!conversationId" class="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <BrandLogo :size="56" :online="Boolean(online)" />
          <h2 class="mt-3 text-[18px]">Que puis-je faire pour vous ?</h2>
          <p class="text-xs text-muted">Je fouille vos documents, consulte votre planning et prépare des actions que vous validez.</p>
        </div>

        <template v-for="(message, index) in messages" :key="message.id">
          <p v-if="dayLabel(index)" class="text-center text-2xs font-extrabold text-muted">{{ dayLabel(index) }}</p>
          <ChatMessage v-if="message.role === 'user'" :message="message" :answered="replies.has(message.id)" :agent-online="online" @retry="retry" />
          <template v-if="message.role === 'user' && !replies.has(message.id) && (steps[message.id]?.length || message.status === 'processing')">
            <div class="mr-[8%] flex items-start gap-2.5">
              <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-ink text-on-ink"><AppIcon name="microchip" :size="14" /></span>
              <AgentTimeline class="min-w-0 flex-1" :steps="steps[message.id] ?? []" :running="message.status === 'processing'" />
            </div>
            <ChatMessage v-if="draftMessage(message)" :message="draftMessage(message)!" aria-live="polite" data-testid="answer-draft" />
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

        <div v-for="entry in queued" :key="entry.id" class="ml-[15%] flex flex-col items-end gap-1" data-testid="outbox-message">
          <div class="rounded-lg px-4 py-3 whitespace-pre-wrap [word-break:break-word]" :class="entry.error ? 'bg-danger-soft text-text' : 'bg-ink/65 text-on-ink'">{{ entry.content }}</div>
          <div class="flex items-center gap-1.5 text-2xs font-extrabold text-muted">
            <span v-if="entry.error" class="inline-flex items-center gap-1 text-danger"><AppIcon name="circle-exclamation" :size="11" />Non envoyé · {{ entry.error }}</span>
            <span v-else class="inline-flex items-center gap-1"><AppIcon name="clock" :size="10" />En attente d’envoi</span>
            <button class="text-btn text-2xs" type="button" @click="outbox.remove(entry.id)">{{ entry.error ? 'Retirer' : 'Annuler' }}</button>
          </div>
        </div>

        <div v-if="typing" class="mr-[8%] flex items-start gap-2.5">
          <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-ink text-on-ink"><AppIcon name="microchip" :size="14" /></span>
          <span class="inline-flex items-center gap-1 rounded-lg border bg-surface px-3.5 py-2.5 text-[12px] font-bold text-muted"><span class="typing-dot size-[5px] rounded-full bg-current" /><span class="typing-dot size-[5px] rounded-full bg-current" /><span class="typing-dot mr-1 size-[5px] rounded-full bg-current" /> Rédaction de la réponse…</span>
        </div>
      </div>
    </div>

    <footer class="border-t bg-bg px-4 py-3">
      <div class="mx-auto flex w-full max-w-[760px] flex-col gap-2">
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
/* Points animés de « Rédaction de la réponse… » (keyframes). */
.typing-dot {
  animation: blink 1.2s infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
</style>
