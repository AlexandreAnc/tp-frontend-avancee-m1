<script setup lang="ts">
import type { AgendaItem } from '@app/shared';

useHead({ title: 'Accueil · DashIA' });

const { me } = useMe();
const { online, agent } = useAgentStatus();
const command = ref('');
const sending = ref(false);
const error = ref<string | null>(null);

const today = dayRange();
const nextMonth = dayRange(new Date(), 0, 31);

const { data: agenda, refresh: refreshAgenda } = await useFetch('/api/agenda', { key: 'panel-agenda', query: today });
const { data: upcoming, refresh: refreshUpcoming } = await useFetch('/api/agenda', { key: 'panel-upcoming', query: nextMonth });
const { data: actions, refresh: refreshActions } = await useFetch('/api/actions', { key: 'panel-actions', query: { status: 'pending' } });
const { data: filesData, refresh: refreshFiles } = await useFetch('/api/files', { key: 'files' });
const { data: journal, refresh: refreshActivity } = await useFetch('/api/journal', { key: 'panel-journal', query: { limit: 4 } });
const { data: status, refresh: refreshStatus } = await useFetch('/api/status', { key: 'status' });

useEvents((event) => {
  if (event.type === 'action.created' || event.type === 'action.updated') void refreshActions();
  if (event.type === 'file.updated' || event.type === 'file.deleted') {
    void refreshFiles();
    void refreshStatus();
    void refreshUpcoming();
  }
  if (event.type === 'reminder.updated') void refreshAgenda();
  if (event.type === 'activity.created' || event.type === 'action.updated' || event.type === 'file.updated') void refreshActivity();
  if (event.type === 'message.status' || event.type === 'agent.status') void refreshStatus();
});

const deadlines = computed(() => (upcoming.value?.items ?? [])
  .filter((item): item is Extract<AgendaItem, { kind: 'deadline' }> => item.kind === 'deadline')
  .slice(0, 3));
const recentFiles = computed(() => (filesData.value?.files ?? []).slice(0, 3));
const firstName = computed(() => me.value?.user.name.split(' ')[0] ?? '');

async function ask() {
  const content = command.value.trim();
  if (!content) return;
  sending.value = true;
  error.value = null;
  try {
    const { conversationId } = await $fetch('/api/conversations', { method: 'POST', body: { content } });
    await navigateTo(`/chat/${conversationId}`);
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <main class="page">
    <header class="hello">
      <UserAvatar v-if="me" :name="me.user.name" :size="48" />
      <div class="grow">
        <p class="small muted strong">{{ formatDayLong(new Date()) }}</p>
        <h1 class="greeting">Bonjour {{ firstName }}</h1>
      </div>
      <div class="mobile-only row">
        <StorageMeter v-if="me" :used-bytes="me.quota.usedBytes" :max-bytes="me.quota.maxBytes" compact />
        <NuxtLink to="/actions" class="icon-btn bell" aria-label="Actions à valider">
          <AppIcon name="bell" />
          <span v-if="actions?.actions.length" class="bell-count">{{ actions.actions.length }}</span>
        </NuxtLink>
      </div>
    </header>

    <form class="command" @submit.prevent="ask">
      <label class="input-group">
        <AppIcon name="wand" :size="14" class="wand" />
        <span class="sr-only">Demander à l'agent</span>
        <input v-model="command" placeholder="Demander à l'agent…" :disabled="sending" enterkeyhint="send">
        <button v-if="command.trim()" class="icon-btn icon-btn-primary send" type="submit" :disabled="sending" aria-label="Envoyer">
          <AppIcon name="arrow-up" :size="14" />
        </button>
      </label>
      <p v-if="error" class="alert alert-error">{{ error }}</p>
    </form>

    <div class="grid-2">
      <div class="stack">
        <PanelToday :today="agenda?.items ?? []" :deadlines="deadlines" :calendar-connected="agenda?.calendarConnected ?? false" />
        <PanelActions :actions="(actions?.actions ?? []).slice(0, 2)" :total="actions?.actions.length ?? 0" @decided="refreshActions" />
        <PanelHome />
        <PanelCard title="Routines" icon="repeat" tone="primary">
          <div class="empty-state">
            <span class="icon-tile tone-primary"><AppIcon name="repeat" :size="16" /></span>
            <strong>Aucune routine</strong>
            <p>« Je pars », « Bonne nuit »… arrivent bientôt, avec les tags NFC.</p>
          </div>
        </PanelCard>
      </div>
      <div class="stack">
        <PanelDocuments :files="recentFiles" />
        <PanelAgentCard :online="online ?? status?.online ?? null" :agent="agent ?? status?.agent ?? null" :queue="status?.queue ?? null" />
        <PanelActivity :entries="journal?.entries ?? []" />
      </div>
    </div>
  </main>
  <HomeToast />
</template>

<style scoped>
.hello {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}

.greeting {
  font-size: 20px;
  line-height: 28px;
  letter-spacing: -0.5px;
}

.bell {
  position: relative;
}

.bell-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 18px;
  text-align: center;
}

.command {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: -8px;
}

.wand {
  color: var(--primary);
}

.send {
  width: 32px;
  height: 32px;
  margin-right: -8px;
}

@media (min-width: 1024px) {
  .mobile-only {
    display: none;
  }
}
</style>
