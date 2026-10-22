<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';
import type { IconName } from '~/utils/icons';

useHead({ title: 'Confirmation · DashIA' });

// Ouvert au clic sur une notification : obligatoire sur iOS, qui n'affiche pas les boutons d'action.
const route = useRoute();
const id = route.params.id as string;
const { data, error: loadError, refresh } = await useFetch<ApiResponse<'/api/actions/:id', 'get'>>(`/api/actions/${id}`, { key: `action-${id}` });
const busy = ref(false);
const error = ref<string | null>(null);
const pending = usePendingActions();

useEvents((event) => {
  if (event.type === 'action.updated' && event.actionId === id) void refresh();
});

const action = computed(() => data.value?.action ?? null);
const event = computed(() => (action.value?.payload ?? {}) as { title?: string; start?: string; end?: string; location?: string; description?: string });
const rows = computed(() => {
  if (action.value?.type !== 'google_calendar.create_event') return [];
  return [
    { label: 'Titre', value: event.value.title },
    { label: 'Quand', value: event.value.start ? `${formatDayLong(event.value.start)} · ${formatTime(event.value.start)}${event.value.end ? ` – ${formatTime(event.value.end)}` : ''}` : null },
    { label: 'Lieu', value: event.value.location },
    { label: 'Détail', value: event.value.description },
  ].filter((row) => row.value);
});

const VISUALS: Record<string, { icon: IconName; tone: string; done: string }> = {
  'google_calendar.create_event': { icon: 'calendar-plus', tone: 'tone-primary', done: 'Événement ajouté' },
};
const visual = computed(() => VISUALS[action.value?.type ?? ''] ?? { icon: 'hand' as IconName, tone: 'tone-warning', done: 'Action exécutée' });
const link = computed(() => (action.value?.result as { htmlLink?: string } | null | undefined)?.htmlLink ?? null);

async function decide(decision: 'approve' | 'reject') {
  busy.value = true;
  error.value = null;
  try {
    await $fetch(`/api/actions/${id}/decision`, { method: 'POST', body: { decision } });
    await refresh();
    await pending.refresh();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader title="Confirmation" back="/actions" />
    <main class="page page-narrow">
      <p v-if="loadError" class="alert alert-error">{{ getErrorMessage(loadError, 'Action introuvable.') }}</p>

      <!-- Retour d'exécution -->
      <section v-else-if="action && action.status === 'executed'" class="card result">
        <span class="big-check"><AppIcon name="check" :size="22" /></span>
        <h1>{{ visual.done }}</h1>
        <p class="muted">{{ action.summary }}</p>
        <ul class="done-list">
          <li><AppIcon name="circle-check" :size="14" />Validé par vous</li>
          <li><AppIcon name="circle-check" :size="14" />Exécuté par le serveur avec votre connexion</li>
          <li v-if="link"><AppIcon name="circle-check" :size="14" /><a :href="link" target="_blank" rel="noopener">Voir dans Google Agenda</a></li>
        </ul>
        <div class="buttons">
          <NuxtLink to="/journal" class="btn">Voir le journal</NuxtLink>
          <NuxtLink to="/" class="btn btn-ink">Terminé</NuxtLink>
        </div>
      </section>

      <section v-else-if="action" class="card confirm">
        <span class="icon-tile" :class="visual.tone"><AppIcon :name="visual.icon" :size="18" /></span>
        <h1>{{ action.summary }}</h1>
        <p class="muted">Voici exactement ce que l'agent va faire :</p>

        <dl v-if="rows.length" class="details">
          <div v-for="row in rows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <ul class="facts small">
          <li v-if="action.conversationId"><AppIcon name="comments" :size="12" /><span><strong>Pourquoi ?</strong> Vous l'avez demandé <NuxtLink :to="`/chat/${action.conversationId}`">dans une discussion</NuxtLink>.</span></li>
          <li><AppIcon name="clock" :size="12" /><span>{{ action.status === 'pending' ? `Expire ${formatRelative(action.expiresAt)} : sans validation, rien ne sera fait.` : `Statut : ${ACTION_STATUS_LABELS[action.status].label}.` }}</span></li>
          <li v-if="action.risk === 'sensitive'" class="warn"><AppIcon name="triangle-exclamation" :size="12" /><span>Action sensible : elle ne pourra pas être annulée.</span></li>
        </ul>

        <p v-if="action.error" class="alert alert-error">{{ action.error }}</p>
        <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

        <template v-if="action.status === 'pending'">
          <button class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="busy" @click="decide('approve')">
            <AppIcon v-if="action.risk === 'sensitive'" name="face-smile" :size="16" />
            {{ action.risk === 'sensitive' ? 'Valider avec Face ID' : 'Valider' }}
          </button>
          <button class="text-btn reject" type="button" :disabled="busy" @click="decide('reject')">Refuser cette action</button>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.confirm,
.result {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  border-radius: var(--radius-xl);
}

.confirm h1,
.result h1 {
  font-size: 22px;
  line-height: 28px;
}

.confirm .icon-tile {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
}

.details {
  margin: 0;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface-muted);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.details div {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 12px;
}

.details dt {
  color: var(--text-muted);
  font-size: 12px;
}

.details dd {
  margin: 0;
  font-weight: 700;
}

.facts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.facts li {
  display: flex;
  gap: 8px;
  color: var(--text-muted);
}

.facts li .app-icon {
  margin-top: 3px;
}

.facts strong {
  color: var(--text);
}

.facts .warn {
  color: var(--warning);
}

.reject {
  align-self: center;
  color: var(--danger);
  font-size: 14px;
}

.result {
  align-items: center;
  text-align: center;
}

.big-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
}

.done-list {
  list-style: none;
  margin: 0;
  padding: 16px;
  width: 100%;
  border-radius: var(--radius);
  background: var(--surface-muted);
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.done-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
}

.done-list .app-icon {
  color: var(--primary);
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  width: 100%;
}
</style>
