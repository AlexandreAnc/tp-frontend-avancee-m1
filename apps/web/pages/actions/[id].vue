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
      <section v-else-if="action && action.status === 'executed'" class="card flex flex-col items-center gap-3.5 rounded-xl p-6 text-center">
        <span class="inline-flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary"><AppIcon name="check" :size="22" /></span>
        <h1 class="text-[22px] leading-7">{{ visual.done }}</h1>
        <p class="text-muted">{{ action.summary }}</p>
        <ul class="flex w-full flex-col gap-2 rounded-md bg-surface-muted p-4 text-left">
          <li class="flex items-center gap-2 text-[12px] font-bold"><AppIcon name="circle-check" :size="14" class="text-primary" />Validé par vous</li>
          <li class="flex items-center gap-2 text-[12px] font-bold"><AppIcon name="circle-check" :size="14" class="text-primary" />Exécuté par le serveur avec votre connexion</li>
          <li v-if="link" class="flex items-center gap-2 text-[12px] font-bold"><AppIcon name="circle-check" :size="14" class="text-primary" /><a :href="link" target="_blank" rel="noopener">Voir dans Google Agenda</a></li>
        </ul>
        <div class="grid w-full grid-cols-[1fr_1fr] gap-2">
          <NuxtLink to="/journal" class="btn">Voir le journal</NuxtLink>
          <NuxtLink to="/panel" class="btn btn-ink">Terminé</NuxtLink>
        </div>
      </section>

      <section v-else-if="action" class="card flex flex-col gap-3.5 rounded-xl p-6">
        <span class="icon-tile size-12 rounded-lg" :class="visual.tone"><AppIcon :name="visual.icon" :size="18" /></span>
        <h1 class="text-[22px] leading-7">{{ action.summary }}</h1>
        <p class="text-muted">Voici exactement ce que l'agent va faire :</p>

        <dl v-if="rows.length" class="flex flex-col gap-2.5 rounded-lg bg-surface-muted p-4">
          <div v-for="row in rows" :key="row.label" class="grid grid-cols-[64px_1fr] gap-3">
            <dt class="text-[12px] text-muted">{{ row.label }}</dt>
            <dd class="font-bold">{{ row.value }}</dd>
          </div>
        </dl>

        <ul class="flex flex-col gap-2 text-xs">
          <li v-if="action.conversationId" class="flex gap-2 text-muted"><AppIcon name="comments" :size="12" class="mt-[3px]" /><span><strong class="text-text">Pourquoi ?</strong> Vous l'avez demandé <NuxtLink :to="`/chat/${action.conversationId}`">dans une discussion</NuxtLink>.</span></li>
          <li class="flex gap-2 text-muted"><AppIcon name="clock" :size="12" class="mt-[3px]" /><span>{{ action.status === 'pending' ? `Expire ${formatRelative(action.expiresAt)} : sans validation, rien ne sera fait.` : `Statut : ${ACTION_STATUS_LABELS[action.status].label}.` }}</span></li>
          <li v-if="action.risk === 'sensitive'" class="flex gap-2 text-warning"><AppIcon name="triangle-exclamation" :size="12" class="mt-[3px]" /><span>Action sensible : elle ne pourra pas être annulée.</span></li>
        </ul>

        <p v-if="action.error" class="alert alert-error">{{ action.error }}</p>
        <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

        <template v-if="action.status === 'pending'">
          <button class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="busy" @click="decide('approve')">
            <AppIcon v-if="action.risk === 'sensitive'" name="face-smile" :size="16" />
            {{ action.risk === 'sensitive' ? 'Valider avec Face ID' : 'Valider' }}
          </button>
          <button class="text-btn self-center text-[14px] text-danger" type="button" :disabled="busy" @click="decide('reject')">Refuser cette action</button>
        </template>
      </section>
    </main>
  </div>
</template>
