<script setup lang="ts">
import type { ActionItem } from '~/components/ActionCard.vue';

useHead({ title: 'Actions · DashIA' });

type Tab = 'pending' | 'running' | 'history';
const tab = ref<Tab>('pending');
const { data, refresh } = await useFetch('/api/actions', { key: 'actions' });
const pendingCount = usePendingActions();

useEvents((event) => {
  if (event.type === 'action.created' || event.type === 'action.updated') void refresh();
});

const actions = computed(() => (data.value?.actions ?? []) as ActionItem[]);
const lists = computed<Record<Tab, ActionItem[]>>(() => ({
  pending: actions.value.filter((action) => action.status === 'pending'),
  running: actions.value.filter((action) => action.status === 'approved'),
  history: actions.value.filter((action) => !['pending', 'approved'].includes(action.status)),
}));

async function onDecided() {
  await refresh();
  await pendingCount.refresh();
}
</script>

<template>
  <div>
    <PageHeader title="Actions" subtitle="L'agent propose, vous décidez" back="/plus">
      <template #below>
        <div class="chips" role="tablist">
          <button class="chip" :class="{ active: tab === 'pending' }" type="button" role="tab" @click="tab = 'pending'">
            À valider <span v-if="lists.pending.length" class="count-badge">{{ lists.pending.length }}</span>
          </button>
          <button class="chip" :class="{ active: tab === 'running' }" type="button" role="tab" @click="tab = 'running'">En cours</button>
          <button class="chip" :class="{ active: tab === 'history' }" type="button" role="tab" @click="tab = 'history'">Historique</button>
        </div>
      </template>
    </PageHeader>

    <main class="page page-narrow">
      <div v-if="lists[tab].length" class="flex flex-col gap-3 *:min-w-0">
        <ActionCard v-for="action in lists[tab]" :key="action.id" :action="action" @decided="onDecided" />
      </div>
      <div v-else class="empty-state">
        <span class="icon-tile tone-primary"><AppIcon name="check-double" :size="16" /></span>
        <strong>{{ tab === 'pending' ? 'Tout est validé' : tab === 'running' ? 'Rien en cours' : 'Pas encore d’historique' }}</strong>
        <p>Rien n'est modifié sans votre accord : chaque action proposée attend ici votre validation pendant 15 minutes.</p>
      </div>
    </main>
  </div>
</template>
