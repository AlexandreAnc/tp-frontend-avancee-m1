<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';

useHead({ title: 'Corbeille · DashIA' });

type TrashedFile = ApiResponse<'/api/trash', 'get'>['files'][number];

const { data, refresh } = await useFetch('/api/trash', { key: 'trash' });
const { refresh: refreshMe } = useMe();
const { ask } = useConfirm();
const selection = ref(new Set<string>());
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

useEvents((event) => {
  if (event.type === 'drive.changed') void refresh();
});

const files = computed(() => data.value?.files ?? []);
const allSelected = computed(() => files.value.length > 0 && files.value.every((file) => selection.value.has(file.id)));

function toggle(id: string) {
  const next = new Set(selection.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selection.value = next;
}

async function run(task: () => Promise<unknown>, success: string) {
  error.value = null;
  notice.value = null;
  try {
    await task();
    notice.value = success;
    selection.value = new Set();
    await Promise.all([refresh(), refreshMe()]);
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

const plural = (count: number) => `${count} fichier${count > 1 ? 's' : ''}`;

function restore(ids: string[]) {
  void run(() => $fetch<unknown>('/api/trash/restore', { method: 'POST', body: { fileIds: ids } }), `${plural(ids.length)} restauré${ids.length > 1 ? 's' : ''} dans le drive.`);
}

async function deleteForever(ids: string[]) {
  const confirmed = await ask({
    title: `Supprimer définitivement ${ids.length > 1 ? plural(ids.length) : `« ${files.value.find((file) => file.id === ids[0])?.name} »`} ?`,
    message: 'Le fichier et son contenu indexé seront effacés. Impossible de revenir en arrière.',
    confirm: 'Supprimer définitivement',
    danger: true,
  });
  if (confirmed) await run(() => $fetch<unknown>('/api/trash/delete', { method: 'POST', body: { fileIds: ids } }), `${plural(ids.length)} supprimé${ids.length > 1 ? 's' : ''} définitivement.`);
}

async function emptyTrash() {
  const confirmed = await ask({
    title: 'Vider la corbeille ?',
    message: `${plural(files.value.length)} (${formatBytes(data.value?.sizeBytes ?? 0)}) seront supprimés définitivement.`,
    confirm: 'Vider la corbeille',
    danger: true,
  });
  if (confirmed) await run(() => $fetch<unknown>('/api/trash/delete', { method: 'POST', body: { all: true } }), 'Corbeille vidée.');
}

function purgeLabel(file: TrashedFile) {
  const days = Math.max(0, daysUntil(file.purgeAt));
  return days === 0 ? 'supprimé définitivement aujourd’hui' : `supprimé définitivement dans ${days} jour${days > 1 ? 's' : ''}`;
}
</script>

<template>
  <div>
    <PageHeader title="Corbeille" :subtitle="data ? `${plural(files.length)} · ${formatBytes(data.sizeBytes)}` : undefined" back="/drive">
      <template #actions>
        <button v-if="files.length" class="btn btn-sm btn-danger" type="button" @click="emptyTrash"><AppIcon name="trash" :size="12" />Vider</button>
      </template>
    </PageHeader>

    <main class="page flex max-w-[860px] flex-col gap-3 *:min-w-0">
      <p class="alert alert-info">
        <AppIcon name="clock-rotate-left" :size="14" />
        Les fichiers restent {{ data?.retentionDays ?? 30 }} jours dans la corbeille, puis sont supprimés définitivement. Ils comptent dans vos {{ formatBytes(data?.quota.maxBytes ?? 0) }} tant que la corbeille n’est pas vidée.
      </p>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="alert alert-success" role="status"><AppIcon name="circle-check" :size="14" />{{ notice }}</p>

      <div v-if="files.length" class="flex items-center gap-2">
        <label class="inline-flex cursor-pointer items-center gap-2.5 text-xs font-extrabold">
          <input type="checkbox" class="m-[3px] ml-1" :checked="allSelected" :indeterminate="selection.size > 0 && !allSelected" @change="selection = allSelected ? new Set() : new Set(files.map((file) => file.id))">
          {{ selection.size ? `${selection.size} sélectionné${selection.size > 1 ? 's' : ''}` : 'Tout sélectionner' }}
        </label>
        <span class="min-w-0 flex-1" />
        <template v-if="selection.size">
          <button class="btn btn-sm" type="button" @click="restore([...selection])"><AppIcon name="clock-rotate-left" :size="12" />Restaurer</button>
          <button class="btn btn-sm btn-danger" type="button" @click="deleteForever([...selection])">Supprimer</button>
        </template>
      </div>

      <div v-if="files.length" class="card card-flush">
        <div
          v-for="file in files"
          :key="file.id"
          class="flex items-center gap-3 px-3.5 py-3 not-first:border-t"
          :class="{ 'bg-[color-mix(in_srgb,var(--color-info-soft)_50%,var(--color-surface))]': selection.has(file.id) }"
        >
          <input type="checkbox" class="m-[3px] ml-1 size-[18px] accent-ink" :checked="selection.has(file.id)" :aria-label="`Sélectionner ${file.name}`" @change="toggle(file.id)">
          <FileTypeIcon :mime-type="file.mimeType" :size="32" />
          <span class="flex min-w-0 flex-1 flex-col">
            <strong class="truncate font-extrabold">{{ file.name }}</strong>
            <span class="truncate text-2xs text-muted">{{ file.path || 'Mon drive' }} · {{ formatBytes(file.sizeBytes) }} · {{ purgeLabel(file) }}</span>
          </span>
          <button class="btn btn-sm max-[480px]:hidden" type="button" @click="restore([file.id])">Restaurer</button>
          <button class="icon-btn size-8" type="button" :aria-label="`Supprimer définitivement ${file.name}`" @click="deleteForever([file.id])"><AppIcon name="trash" :size="11" /></button>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="icon-tile tone-info"><AppIcon name="trash" :size="16" /></span>
        <strong>Corbeille vide</strong>
        <p>Les fichiers supprimés du drive arrivent ici : vous pouvez les restaurer pendant {{ data?.retentionDays ?? 30 }} jours.</p>
      </div>
    </main>
  </div>
</template>
