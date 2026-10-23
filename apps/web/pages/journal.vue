<script setup lang="ts">
import type { JournalEntry } from '~/components/JournalItem.vue';

useHead({ title: "Journal d'activité · DashIA" });

const filter = ref<'all' | 'actions' | 'documents' | 'routines'>('all');
const search = ref('');
const entries = ref<JournalEntry[]>([]);
const hasMore = ref(false);
const loading = ref(false);

async function load(reset = true) {
  loading.value = true;
  try {
    const before = reset ? undefined : entries.value.at(-1)?.createdAt;
    const page = await $fetch('/api/journal', { query: { limit: 30, ...(before ? { before } : {}) } });
    entries.value = reset ? page.entries : [...entries.value, ...page.entries];
    hasMore.value = page.hasMore;
  } finally {
    loading.value = false;
  }
}

await load();
useEvents((event) => {
  if (event.type === 'activity.created' || event.type === 'action.updated' || event.type === 'file.updated') void load();
});

const visible = computed(() => {
  const query = search.value.trim().toLowerCase();
  return entries.value.filter((entry) => (filter.value === 'all' || entry.category === filter.value)
    && (!query || `${entry.title} ${entry.detail ?? ''}`.toLowerCase().includes(query)));
});

const stats = computed(() => ({
  total: entries.value.length,
  validated: entries.value.filter((entry) => entry.origin === 'Validé par vous').length,
  failed: entries.value.filter((entry) => entry.status === 'failed').length,
}));

const groups = computed(() => {
  const map = new Map<string, JournalEntry[]>();
  for (const entry of visible.value) {
    const days = daysUntil(entry.createdAt);
    const label = days === 0 ? 'Aujourd’hui' : days === -1 ? `Hier · ${formatDayLong(entry.createdAt)}` : formatDayLong(entry.createdAt);
    map.set(label, [...(map.get(label) ?? []), entry]);
  }
  return [...map].map(([label, items]) => ({ label, items }));
});

/** Export local du journal chargé (fichier JSON téléchargé par le navigateur). */
function exportJournal() {
  const blob = new Blob([JSON.stringify(entries.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `journal-dashia-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div>
    <PageHeader title="Journal d'activité" subtitle="Actions, validations et analyses" back="/plus">
      <template #actions>
        <button class="icon-btn" type="button" aria-label="Exporter le journal" @click="exportJournal"><AppIcon name="arrow-up-from-bracket" /></button>
      </template>
      <template #below>
        <label class="input-group min-h-11">
          <AppIcon name="search" :size="14" />
          <span class="sr-only">Rechercher dans le journal</span>
          <input v-model="search" class="px-0.5" type="search" placeholder="Rechercher dans le journal">
        </label>
        <div class="chips">
          <button class="chip" :class="{ active: filter === 'all' }" type="button" @click="filter = 'all'">Tout</button>
          <button class="chip" :class="{ active: filter === 'actions' }" type="button" @click="filter = 'actions'">Actions</button>
          <button class="chip" :class="{ active: filter === 'documents' }" type="button" @click="filter = 'documents'">Documents</button>
          <button class="chip" :class="{ active: filter === 'routines' }" type="button" @click="filter = 'routines'">Routines</button>
        </div>
      </template>
    </PageHeader>

    <main class="page page-narrow">
      <div class="grid grid-cols-[repeat(3,1fr)] gap-2">
        <div class="card flex flex-col gap-0.5 p-3.5"><strong class="text-[22px] leading-7 font-extrabold">{{ stats.total }}</strong><span class="text-xs font-extrabold text-muted">Événements</span></div>
        <div class="card flex flex-col gap-0.5 p-3.5"><strong class="text-[22px] leading-7 font-extrabold text-primary-strong">{{ stats.validated }}</strong><span class="text-xs font-extrabold text-muted">Validations</span></div>
        <div class="card flex flex-col gap-0.5 p-3.5"><strong class="text-[22px] leading-7 font-extrabold text-danger">{{ stats.failed }}</strong><span class="text-xs font-extrabold text-muted">Échecs</span></div>
      </div>

      <section v-for="group in groups" :key="group.label" class="flex flex-col gap-3">
        <h2 class="section-label">{{ group.label }}</h2>
        <ul class="relative flex flex-col gap-3 before:absolute before:top-5 before:bottom-5 before:left-[19.5px] before:w-px before:bg-border">
          <JournalItem v-for="entry in group.items" :key="entry.id" :entry="entry" @changed="load()" />
        </ul>
      </section>

      <div v-if="!visible.length" class="empty-state">
        <span class="icon-tile"><AppIcon name="clock-rotate-left" :size="16" /></span>
        <strong>{{ entries.length ? 'Aucun résultat' : "Pas encore d'activité" }}</strong>
        <p>Les actions de l'agent, vos validations et les analyses de documents s'afficheront ici.</p>
      </div>

      <button v-if="hasMore" class="btn btn-lg btn-block" type="button" :disabled="loading" @click="load(false)">Charger plus</button>
    </main>
  </div>
</template>
