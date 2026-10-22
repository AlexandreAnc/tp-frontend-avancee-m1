<script setup lang="ts">
import type { FileCategory } from '@app/shared';
import type { MenuItem } from '~/components/ActionMenu.vue';
import type { FileItem } from '~/components/FileRow.vue';
import type { ApiResponse } from '#shared/types/api';
import type { IconName } from '~/utils/icons';

useHead({ title: 'Drive · DashIA' });

type DriveFolder = ApiResponse<'/api/drive', 'get'>['folders'][number];

const route = useRoute();
const router = useRouter();
const { refresh: refreshMe } = useMe();

/** Dossier ouvert dans l'URL (`?dossier=`), pour que le retour arrière du navigateur remonte d'un niveau. */
const folderId = computed(() => (typeof route.query.dossier === 'string' ? route.query.dossier : null));
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const debouncedSearch = ref(search.value);
const category = ref<FileCategory | null>(null);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => (debouncedSearch.value = value.trim()), 250);
});

const { data, refresh, error: loadError } = await useFetch('/api/drive', {
  key: 'drive',
  query: computed(() => ({
    folderId: folderId.value ?? undefined,
    q: debouncedSearch.value || undefined,
    category: category.value ?? undefined,
  })),
});

const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const previewId = ref<string | null>(typeof route.query.preview === 'string' ? route.query.preview : null);
const busySuggestion = ref<string | null>(null);
const ignored = useIgnoredSuggestions();

useEvents((event) => {
  if (event.type === 'file.updated' || event.type === 'file.deleted' || event.type === 'drive.changed') void refresh();
});

const files = computed(() => (data.value?.files ?? []) as FileItem[]);
const folders = computed(() => data.value?.folders ?? []);
const path = computed(() => data.value?.path ?? []);
const currentFolder = computed(() => data.value?.folder ?? null);
const searching = computed(() => data.value?.search ?? false);
const quota = computed(() => data.value?.quota ?? { usedBytes: 0, maxBytes: 0 });

function openFolder(id: string | null) {
  selection.value = new Set();
  selectedId.value = null;
  search.value = '';
  debouncedSearch.value = '';
  category.value = null;
  void router.push({ query: id ? { dossier: id } : {} });
}

/* ───────── Affichage : vue, tri ───────── */

type View = 'list' | 'grid';
type SortKey = 'recent' | 'name' | 'size' | 'type';
const SORTS: Record<SortKey, string> = { recent: 'Plus récents', name: 'Nom', size: 'Taille', type: 'Type' };
const view = ref<View>('list');
const sort = ref<SortKey>('recent');

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('drive.display') ?? '{}') as { view?: View; sort?: SortKey };
    if (saved.view === 'list' || saved.view === 'grid') view.value = saved.view;
    if (saved.sort && saved.sort in SORTS) sort.value = saved.sort;
  } catch {
    // Préférence d'affichage seulement : on garde les valeurs par défaut.
  }
});
watch([view, sort], () => {
  try {
    localStorage.setItem('drive.display', JSON.stringify({ view: view.value, sort: sort.value }));
  } catch {
    // Stockage indisponible (navigation privée) : sans conséquence.
  }
});

const sortItems = computed<MenuItem[]>(() => (Object.keys(SORTS) as SortKey[]).map((key) => ({
  label: `${sort.value === key ? '✓ ' : ''}${SORTS[key]}`,
  icon: 'sort',
  action: () => (sort.value = key),
})));

const extension = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
const sortedFiles = computed(() => {
  const sorters: Record<SortKey, (a: FileItem, b: FileItem) => number> = {
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    name: (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }),
    size: (a, b) => b.sizeBytes - a.sizeBytes,
    type: (a, b) => extension(a.name).localeCompare(extension(b.name)) || a.name.localeCompare(b.name, 'fr', { numeric: true }),
  };
  return [...files.value].sort(sorters[sort.value]);
});
const sortedFolders = computed(() => {
  const list = [...folders.value];
  if (sort.value === 'size') return list.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
});

/* ───────── Sélection multiple ───────── */

const selection = ref(new Set<string>());
const selectionCount = computed(() => selection.value.size);
const allSelected = computed(() => files.value.length > 0 && files.value.every((file) => selection.value.has(file.id)));

function toggleSelection(id: string) {
  const next = new Set(selection.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selection.value = next;
}

function toggleAll() {
  selection.value = allSelected.value ? new Set() : new Set(files.value.map((file) => file.id));
}

watch(files, (list) => {
  // Retire de la sélection les fichiers qui ne sont plus affichés (supprimés, déplacés ailleurs).
  const ids = new Set(list.map((file) => file.id));
  if ([...selection.value].some((id) => !ids.has(id))) selection.value = new Set([...selection.value].filter((id) => ids.has(id)));
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectionCount.value) selection.value = new Set();
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

/* ───────── Actions ───────── */

async function run(task: () => Promise<unknown>, success?: string) {
  error.value = null;
  notice.value = null;
  try {
    await task();
    if (success) notice.value = success;
    await refresh();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

const prompt = ref<{ open: (options: { title: string; label: string; value?: string; confirm?: string }) => void; setError: (message: string) => void } | null>(null);
let onPrompt: ((value: string) => Promise<void>) | null = null;

function askText(options: { title: string; label: string; value?: string; confirm?: string }, handler: (value: string) => Promise<void>) {
  onPrompt = handler;
  prompt.value?.open(options);
}

async function submitPrompt(value: string) {
  await onPrompt?.(value);
}

function newFolder() {
  askText({ title: 'Nouveau dossier', label: currentFolder.value ? `Dans « ${currentFolder.value.name} »` : 'Dans Mon drive', confirm: 'Créer' }, (name) =>
    run(() => $fetch<unknown>('/api/folders', { method: 'POST', body: { name, parentId: folderId.value } }), `Dossier « ${name} » créé.`));
}

function renameFolder(folder: DriveFolder) {
  askText({ title: 'Renommer le dossier', label: 'Nom', value: folder.name, confirm: 'Renommer' }, (name) =>
    run(() => $fetch<unknown>(`/api/folders/${folder.id}`, { method: 'PATCH', body: { name } })));
}

function renameFileItem(file: FileItem) {
  askText({ title: 'Renommer le fichier', label: 'Nom', value: file.name, confirm: 'Renommer' }, (name) =>
    run(() => $fetch<unknown>(`/api/files/${file.id}`, { method: 'PATCH', body: { name } })));
}

const moveDialog = ref<{ open: (options: { title: string; current: string | null; excludeFolderId?: string }) => Promise<void> } | null>(null);
let onMove: ((target: string | null) => Promise<void>) | null = null;

function moveFilesTo(ids: string[]) {
  onMove = (target) => run(async () => {
    await $fetch<unknown>('/api/files/move', { method: 'POST', body: { fileIds: ids, folderId: target } });
    selection.value = new Set();
  }, `${ids.length} fichier${ids.length > 1 ? 's' : ''} déplacé${ids.length > 1 ? 's' : ''}.`);
  void moveDialog.value?.open({ title: ids.length > 1 ? `Déplacer ${ids.length} fichiers` : 'Déplacer le fichier', current: folderId.value });
}

function moveFolder(folder: DriveFolder) {
  onMove = (target) => run(() => $fetch<unknown>(`/api/folders/${folder.id}`, { method: 'PATCH', body: { parentId: target } }), `Dossier « ${folder.name} » déplacé.`);
  void moveDialog.value?.open({ title: `Déplacer « ${folder.name} »`, current: folder.parentId, excludeFolderId: folder.id });
}

async function submitMove(target: string | null) {
  await onMove?.(target);
}

/* Suppression d'un dossier : garder le contenu (remonte d'un niveau) ou tout supprimer. */
const deleteDialog = ref<HTMLDialogElement | null>(null);
const folderToDelete = ref<DriveFolder | null>(null);

function askDeleteFolder(folder: DriveFolder) {
  folderToDelete.value = folder;
  deleteDialog.value?.showModal();
}

async function deleteFolder(mode: 'keep' | 'all') {
  const folder = folderToDelete.value;
  deleteDialog.value?.close();
  if (!folder) return;
  await run(() => $fetch<unknown>(`/api/folders/${folder.id}`, { method: 'DELETE', query: { mode } }),
    mode === 'keep' ? `Dossier « ${folder.name} » supprimé, son contenu a été conservé.` : `Dossier « ${folder.name} » et son contenu supprimés.`);
  await refreshMe();
}

async function removeFiles(ids: string[]) {
  const label = ids.length > 1 ? `ces ${ids.length} fichiers` : `« ${files.value.find((file) => file.id === ids[0])?.name} »`;
  if (!confirm(`Supprimer ${label} ? Leur contenu indexé sera aussi effacé.`)) return;
  await run(async () => {
    await $fetch<unknown>('/api/files/delete', { method: 'POST', body: { fileIds: ids } });
    if (selectedId.value && ids.includes(selectedId.value)) selectedId.value = null;
    selection.value = new Set();
  });
  await refreshMe();
}

async function reindex(id: string) {
  await run(() => $fetch<unknown>(`/api/files/${id}/reindex`, { method: 'POST' }));
}

async function onUploaded() {
  await Promise.all([refresh(), refreshMe()]);
}

function folderMenu(folder: DriveFolder): MenuItem[] {
  return [
    { label: 'Ouvrir', icon: 'folder-open', action: () => openFolder(folder.id) },
    { label: 'Renommer', icon: 'pen-to-square', action: () => renameFolder(folder) },
    { label: 'Déplacer…', icon: 'file-export', action: () => moveFolder(folder) },
    { label: 'Supprimer', icon: 'trash', danger: true, action: () => askDeleteFolder(folder) },
  ];
}

function fileMenu(file: FileItem): MenuItem[] {
  return [
    { label: 'Aperçu', icon: 'eye', action: () => (previewId.value = file.id) },
    { label: 'Renommer', icon: 'pen-to-square', action: () => renameFileItem(file) },
    { label: 'Déplacer…', icon: 'file-export', action: () => moveFilesTo([file.id]) },
    ...(file.folderId && searching.value ? [{ label: 'Ouvrir le dossier', icon: 'folder-open' as const, action: () => openFolder(file.folderId!) }] : []),
    { label: 'Télécharger', icon: 'arrow-up-from-bracket', action: () => window.open(`/api/files/${file.id}/content?download=1`, '_self') },
    { label: 'Supprimer', icon: 'trash', danger: true, action: () => removeFiles([file.id]) },
  ];
}

/* ───────── Glisser-déposer interne (fichiers et dossiers vers un dossier) ───────── */

const DRAG_TYPE = 'application/x-dashia-drive';
const dropTarget = ref<string | null>(null);

function onDragStart(event: DragEvent, item: { kind: 'file' | 'folder'; id: string }) {
  const ids = item.kind === 'file' && selection.value.has(item.id) ? [...selection.value] : [item.id];
  event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify({ kind: item.kind, ids }));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event: DragEvent, target: string) {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  dropTarget.value = target;
}

/** `target` : id du dossier, ou `root` pour la racine. */
async function onDrop(event: DragEvent, target: string) {
  dropTarget.value = null;
  const raw = event.dataTransfer?.getData(DRAG_TYPE);
  if (!raw) return;
  event.preventDefault();
  const { kind, ids } = JSON.parse(raw) as { kind: 'file' | 'folder'; ids: string[] };
  const folder = target === 'root' ? null : target;
  if (kind === 'folder') {
    if (ids[0] === folder) return;
    await run(() => $fetch<unknown>(`/api/folders/${ids[0]}`, { method: 'PATCH', body: { parentId: folder } }));
  } else {
    if (folder === folderId.value) return;
    await run(async () => {
      await $fetch<unknown>('/api/files/move', { method: 'POST', body: { fileIds: ids, folderId: folder } });
      selection.value = new Set();
    }, `${ids.length} fichier${ids.length > 1 ? 's' : ''} déplacé${ids.length > 1 ? 's' : ''}.`);
  }
}

/* ───────── Panneau de détail et suggestions ───────── */

const previewed = computed(() => files.value.find((file) => file.id === previewId.value) ?? null);

/** Fichier détaillé : celui choisi, sinon le dernier analysé du dossier. */
const selected = computed(() => files.value.find((file) => file.id === selectedId.value)
  ?? (selectedId.value ? null : files.value.find((file) => file.status === 'ready') ?? null));

interface Suggestion {
  key: string;
  title: string;
  description: string;
  icon: IconName;
  tone: string;
  accept: () => Promise<void>;
}

const suggestions = computed<Suggestion[]>(() => {
  const file = selected.value;
  if (!file?.analysis) return [];
  const list: Suggestion[] = [];
  const suggested = file.analysis.category;
  if (suggested && file.category !== suggested) {
    const similar = data.value?.categories.find((entry) => entry.name === suggested)?.count ?? 0;
    list.push({
      key: `category:${suggested}`,
      title: `Classer dans « ${suggested} »`,
      description: similar
        ? `Rejoint le dossier « ${suggested} », avec ${similar} document${similar > 1 ? 's' : ''} similaire${similar > 1 ? 's' : ''}`
        : `Crée le dossier « ${suggested} » et y range le document`,
      icon: 'folder',
      tone: 'tone-info',
      accept: async () => {
        await $fetch<unknown>(`/api/files/${file.id}`, { method: 'PATCH', body: { category: suggested, folderPath: suggested } });
        await refresh();
        notice.value = `${file.name} est rangé dans le dossier « ${suggested} ».`;
      },
    });
  }
  for (const date of file.analysis.keyInfo.dates) {
    if (!date.isDeadline || !date.iso || daysUntil(date.iso) < 1) continue;
    const remindAt = new Date(`${date.iso}T09:00:00`);
    remindAt.setDate(remindAt.getDate() - 1);
    list.push({
      key: `deadline:${date.iso}:${date.label}`,
      title: `Me rappeler : ${date.label}`,
      description: `La veille à 9h · échéance le ${formatShortDate(date.iso)}`,
      icon: 'bell',
      tone: 'tone-primary',
      accept: async () => {
        await $fetch('/api/reminders', { method: 'POST', body: { text: `${date.label} — ${file.name}`, remindAt: remindAt.toISOString(), fileId: file.id } });
        notice.value = 'Rappel programmé : vous recevrez une notification la veille.';
      },
    });
  }
  for (const action of file.analysis.suggestedActions) {
    list.push({
      key: `action:${action.label}`,
      title: action.label,
      description: action.description,
      icon: 'wand',
      tone: 'tone-warning',
      accept: async () => {
        const { conversationId } = await $fetch('/api/conversations', {
          method: 'POST',
          body: { content: `À propos du document « ${file.name} » : ${action.label}. ${action.description}` },
        });
        await navigateTo(`/chat/${conversationId}`);
      },
    });
  }
  return list.filter((suggestion) => !ignored.has(file.id, suggestion.key));
});

async function accept(suggestion: Suggestion) {
  busySuggestion.value = suggestion.key;
  error.value = null;
  notice.value = null;
  try {
    await suggestion.accept();
    if (selected.value) ignored.add(selected.value.id, suggestion.key);
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busySuggestion.value = null;
  }
}

const isImage = (file: FileItem) => file.mimeType === 'image/jpeg' || file.mimeType === 'image/png';
const sectionTitle = computed(() => (searching.value ? 'Résultats dans tout le drive' : currentFolder.value?.name ?? 'Mon drive'));
const isEmpty = computed(() => !folders.value.length && !files.value.length);
</script>

<template>
  <div>
    <PageHeader :title="currentFolder?.name ?? 'Drive'" :back="currentFolder ? (path.at(-2) ? `/drive?dossier=${path.at(-2)!.id}` : '/drive') : undefined">
      <template #actions>
        <StorageMeter :used-bytes="quota.usedBytes" :max-bytes="quota.maxBytes" compact />
        <button class="icon-btn" type="button" aria-label="Nouveau dossier" title="Nouveau dossier" @click="newFolder"><AppIcon name="folder-solid" :size="15" /></button>
      </template>
      <template #below>
        <label class="input-group search">
          <AppIcon name="search" :size="14" />
          <span class="sr-only">Chercher dans le drive</span>
          <input v-model="search" type="search" placeholder="Chercher « montant loyer », « carte grise »…">
        </label>
        <div class="chips" role="group" aria-label="Catégories">
          <button class="chip" :class="{ active: !category }" type="button" @click="category = null">Tous · {{ data?.totalFiles ?? 0 }}</button>
          <button v-for="entry in data?.categories ?? []" :key="entry.name" class="chip" :class="{ active: category === entry.name }" type="button" @click="category = category === entry.name ? null : entry.name">
            {{ entry.name }} · {{ entry.count }}
          </button>
        </div>
      </template>
    </PageHeader>

    <main class="page drive">
      <div class="col-main stack">
        <FileUploader :used-bytes="quota.usedBytes" :max-bytes="quota.maxBytes" :folder-id="folderId" :folder-name="currentFolder?.name" @uploaded="onUploaded" />
        <p v-if="loadError" class="alert alert-error" role="alert"><AppIcon name="circle-exclamation" :size="14" />{{ getErrorMessage(loadError, 'Ce dossier est introuvable.') }}</p>
        <p v-if="error" class="alert alert-error" role="alert"><AppIcon name="circle-exclamation" :size="14" />{{ error }}</p>
        <p v-if="notice" class="alert alert-success" role="status"><AppIcon name="circle-check" :size="14" />{{ notice }}</p>

        <!-- Fil d'Ariane : chaque niveau est aussi une cible de dépôt. -->
        <nav v-if="!searching" class="crumbs" aria-label="Emplacement">
          <button
            type="button"
            class="crumb"
            :class="{ current: !currentFolder, drop: dropTarget === 'root' }"
            :aria-current="!currentFolder ? 'page' : undefined"
            @click="openFolder(null)"
            @dragover="onDragOver($event, 'root')"
            @dragleave="dropTarget = null"
            @drop="onDrop($event, 'root')"
          >
            <AppIcon name="house" :size="12" />Mon drive
          </button>
          <template v-for="(crumb, index) in path" :key="crumb.id">
            <AppIcon name="chevron-right" :size="9" class="sep" />
            <button
              type="button"
              class="crumb"
              :class="{ current: index === path.length - 1, drop: dropTarget === crumb.id }"
              :aria-current="index === path.length - 1 ? 'page' : undefined"
              @click="openFolder(crumb.id)"
              @dragover="onDragOver($event, crumb.id)"
              @dragleave="dropTarget = null"
              @drop="onDrop($event, crumb.id)"
            >
              {{ crumb.name }}
            </button>
          </template>
        </nav>

        <div class="toolbar">
          <label v-if="files.length" class="check-all small strong">
            <input type="checkbox" :checked="allSelected" :indeterminate="selectionCount > 0 && !allSelected" @change="toggleAll">
            {{ selectionCount ? `${selectionCount} sélectionné${selectionCount > 1 ? 's' : ''}` : sectionTitle }}
          </label>
          <h2 v-else class="small strong">{{ sectionTitle }}</h2>
          <span class="grow" />
          <template v-if="selectionCount">
            <button class="btn btn-sm" type="button" @click="moveFilesTo([...selection])"><AppIcon name="file-export" :size="12" />Déplacer</button>
            <button class="btn btn-sm btn-danger" type="button" @click="removeFiles([...selection])"><AppIcon name="trash" :size="12" />Supprimer</button>
            <button class="icon-btn small-btn" type="button" aria-label="Annuler la sélection" @click="selection = new Set()"><AppIcon name="xmark" :size="11" /></button>
          </template>
          <template v-else>
            <ActionMenu :items="sortItems" :label="`Trier : ${SORTS[sort]}`" />
            <div class="segmented view-toggle" role="group" aria-label="Affichage">
              <button type="button" :class="{ active: view === 'list' }" aria-label="Liste" :aria-pressed="view === 'list'" @click="view = 'list'"><AppIcon name="list-check" :size="12" /></button>
              <button type="button" :class="{ active: view === 'grid' }" aria-label="Grille" :aria-pressed="view === 'grid'" @click="view = 'grid'"><AppIcon name="grid" :size="12" /></button>
            </div>
          </template>
        </div>

        <!-- Dossiers -->
        <section v-if="sortedFolders.length" class="folders" aria-label="Dossiers">
          <div
            v-for="folder in sortedFolders"
            :key="folder.id"
            class="folder"
            :class="{ drop: dropTarget === folder.id }"
            draggable="true"
            @dragstart="onDragStart($event, { kind: 'folder', id: folder.id })"
            @dragover="onDragOver($event, folder.id)"
            @dragleave="dropTarget = null"
            @drop="onDrop($event, folder.id)"
          >
            <button type="button" class="folder-open" :aria-label="`Ouvrir le dossier ${folder.name}`" @click="openFolder(folder.id)">
              <span class="icon-tile tone-info"><AppIcon :name="dropTarget === folder.id ? 'folder-open' : 'folder-solid'" :size="15" /></span>
              <span class="grow">
                <strong class="ellipsis">{{ folder.name }}</strong>
                <span class="tiny muted">{{ folder.fileCount }} fichier{{ folder.fileCount > 1 ? 's' : '' }}{{ folder.sizeBytes ? ` · ${formatBytes(folder.sizeBytes)}` : '' }}</span>
              </span>
            </button>
            <ActionMenu :items="folderMenu(folder)" :label="`Actions pour ${folder.name}`" />
          </div>
        </section>

        <!-- Fichiers -->
        <section v-if="sortedFiles.length" aria-label="Fichiers">
          <div v-if="view === 'list'" class="stack">
            <div
              v-for="file in sortedFiles"
              :key="file.id"
              class="file-line"
              :class="{ checked: selection.has(file.id) }"
              draggable="true"
              @dragstart="onDragStart($event, { kind: 'file', id: file.id })"
            >
              <input type="checkbox" class="pick" :checked="selection.has(file.id)" :aria-label="`Sélectionner ${file.name}`" @change="toggleSelection(file.id)">
              <div class="grow">
                <FileRow :file="file" :selected="selected?.id === file.id" @select="selectedId = $event" @preview="previewId = $event" @delete="removeFiles([$event])" @reindex="reindex">
                  <template #actions><ActionMenu :items="fileMenu(file)" :label="`Actions pour ${file.name}`" /></template>
                </FileRow>
                <button v-if="searching && file.path" type="button" class="path tiny muted" @click="openFolder(file.folderId ?? null)">
                  <AppIcon name="folder" :size="10" />{{ file.path }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="tiles">
            <article
              v-for="file in sortedFiles"
              :key="file.id"
              class="tile"
              :class="{ checked: selection.has(file.id), active: selected?.id === file.id }"
              draggable="true"
              @dragstart="onDragStart($event, { kind: 'file', id: file.id })"
              @click="selectedId = file.id"
              @dblclick="previewId = file.id"
            >
              <button type="button" class="thumb" :aria-label="`Aperçu de ${file.name}`" @click.stop="previewId = file.id">
                <img v-if="isImage(file)" :src="`/api/files/${file.id}/content`" alt="" loading="lazy">
                <FileTypeIcon v-else :mime-type="file.mimeType" :size="44" />
              </button>
              <input type="checkbox" class="pick tile-pick" :checked="selection.has(file.id)" :aria-label="`Sélectionner ${file.name}`" @click.stop @change="toggleSelection(file.id)">
              <div class="tile-meta">
                <span class="grow">
                  <strong class="ellipsis">{{ file.name }}</strong>
                  <span class="tiny muted ellipsis">{{ searching && file.path ? file.path : fileSubtitle(file) }}</span>
                </span>
                <ActionMenu :items="fileMenu(file)" :label="`Actions pour ${file.name}`" />
              </div>
            </article>
          </div>
        </section>

        <div v-if="isEmpty && !loadError" class="empty-state">
          <span class="icon-tile tone-info"><AppIcon name="folder-open" :size="16" /></span>
          <strong>{{ searching ? 'Aucun résultat' : currentFolder ? 'Dossier vide' : 'Drive vide' }}</strong>
          <p>{{ searching ? 'Essayez un autre mot ou une autre catégorie.' : 'Déposez un document ici, ou créez un sous-dossier pour organiser vos fichiers.' }}</p>
          <button v-if="!searching" class="btn btn-sm" type="button" @click="newFolder"><AppIcon name="plus" :size="11" />Nouveau dossier</button>
        </div>
      </div>

      <aside v-if="selected" class="col-side stack">
        <FileDetails :file="selected" @preview="previewId = $event" @reindex="reindex" @delete="removeFiles([$event])" />
        <section v-if="suggestions.length" class="section">
          <h2 class="row"><AppIcon name="wand" :size="14" class="wand" />Suggestions de l'agent</h2>
          <SuggestionCard
            v-for="suggestion in suggestions"
            :key="suggestion.key"
            :title="suggestion.title"
            :description="suggestion.description"
            :icon="suggestion.icon"
            :tone="suggestion.tone"
            :busy="busySuggestion === suggestion.key"
            @accept="accept(suggestion)"
            @ignore="ignored.add(selected.id, suggestion.key)"
          />
        </section>
      </aside>
    </main>

    <FilePreview :file="previewed" @close="previewId = null" />
    <TextPromptDialog ref="prompt" @submit="submitPrompt" />
    <DriveMoveDialog ref="moveDialog" @move="submitMove" />

    <dialog ref="deleteDialog" class="confirm" aria-labelledby="delete-title" @click.self="deleteDialog?.close()">
      <div v-if="folderToDelete" class="stack">
        <h2 id="delete-title">Supprimer « {{ folderToDelete.name }} » ?</h2>
        <p class="small muted">
          {{ folderToDelete.fileCount
            ? `Ce dossier contient ${folderToDelete.fileCount} fichier${folderToDelete.fileCount > 1 ? 's' : ''} (${formatBytes(folderToDelete.sizeBytes)}).`
            : 'Ce dossier ne contient aucun fichier.' }}
        </p>
        <button class="btn btn-ink btn-block" type="button" @click="deleteFolder('keep')">
          Supprimer le dossier, garder le contenu
        </button>
        <button v-if="folderToDelete.fileCount" class="btn btn-danger btn-block" type="button" @click="deleteFolder('all')">
          Tout supprimer ({{ folderToDelete.fileCount }} fichier{{ folderToDelete.fileCount > 1 ? 's' : '' }})
        </button>
        <button class="btn btn-block" type="button" @click="deleteDialog?.close()">Annuler</button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.search {
  min-height: 44px;
}

.search input {
  height: 42px;
}

.wand {
  color: var(--primary);
}

.drive {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Fil d'Ariane */
.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.crumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 6px 10px;
  border: 1px dashed transparent;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.crumb:hover {
  background: var(--surface-muted);
}

.crumb.current {
  color: var(--text);
  font-weight: 800;
}

.crumb.drop {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.sep {
  color: var(--text-muted);
}

/* Barre d'outils */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}

.check-all {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.small-btn {
  width: 32px;
  height: 32px;
}

.view-toggle button {
  min-width: 36px;
  min-height: 32px;
}

/* Dossiers */
.folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.folder {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  transition: border-color 0.15s, background 0.15s;
}

.folder:hover {
  border-color: color-mix(in srgb, var(--ink) 30%, var(--border));
}

.folder.drop {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.folder-open {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.folder-open .grow {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.folder-open strong {
  font-weight: 800;
}

/* Liste */
.file-line {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.file-line .grow {
  min-width: 0;
}

.pick {
  width: 18px;
  height: 18px;
  margin-top: 26px;
  flex-shrink: 0;
  accent-color: var(--ink);
  cursor: pointer;
}

.file-line.checked :deep(.file) {
  background: color-mix(in srgb, var(--info-soft) 50%, var(--surface));
}

.path {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0 4px;
  border: none;
  background: none;
  font-weight: 700;
  cursor: pointer;
}

.path:hover {
  color: var(--text);
}

/* Grille */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
  cursor: pointer;
}

.tile.active {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink);
}

.tile.checked {
  background: color-mix(in srgb, var(--info-soft) 50%, var(--surface));
}

.thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 4 / 3;
  border: none;
  background: var(--surface-muted);
  cursor: zoom-in;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tile-pick {
  position: absolute;
  top: 10px;
  left: 10px;
  margin: 0;
}

.tile-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 6px 8px 12px;
}

.tile-meta .grow {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tile-meta strong {
  font-size: 13px;
  font-weight: 800;
}

/* Suppression de dossier */
.confirm {
  width: min(420px, calc(100% - 24px));
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
}

.confirm::backdrop {
  background: rgb(28 31 35 / 0.45);
}

@media (min-width: 1024px) {
  .drive {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    align-items: start;
  }

  .col-side {
    position: sticky;
    top: 160px;
  }
}

@media (max-width: 480px) {
  .folders {
    grid-template-columns: 1fr 1fr;
  }

  .tiles {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
