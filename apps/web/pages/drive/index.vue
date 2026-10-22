<script setup lang="ts">
import type { FileCategory } from '@app/shared';
import type { MenuItem } from '~/components/ActionMenu.vue';
import type { FileItem } from '~/components/FileRow.vue';
import type { ApiResponse } from '#shared/types/api';
import type { IconName } from '~/utils/icons';

useHead({ title: 'Drive · DashIA' });

type DriveFolder = ApiResponse<'/api/drive', 'get'>['folders'][number];
type DriveFile = FileItem & { snippet?: string | null };

const route = useRoute();
const router = useRouter();
const { refresh: refreshMe } = useMe();

/** Dossier et vue dans l'URL (`?dossier=`, `?vue=`) : le retour arrière du navigateur remonte d'un niveau. */
const folderId = computed(() => (typeof route.query.dossier === 'string' ? route.query.dossier : null));
const VIEWS = { folder: 'Mon drive', recent: 'Récents', starred: 'Favoris' } as const;
type View = keyof typeof VIEWS;
const VIEW_QUERY: Record<View, string | undefined> = { folder: undefined, recent: 'recents', starred: 'favoris' };
const view = computed<View>(() => (route.query.vue === 'recents' ? 'recent' : route.query.vue === 'favoris' ? 'starred' : 'folder'));

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
    view: view.value,
    q: debouncedSearch.value || undefined,
    category: category.value ?? undefined,
  })),
});
const { data: settings, refresh: refreshSettings } = await useFetch('/api/settings', { key: 'settings' });

const error = ref<string | null>(null);
/** Message de confirmation, avec « Annuler » quand l'opération est réversible (mise à la corbeille). */
const notice = ref<{ text: string; undo?: () => Promise<unknown> } | null>(null);
const selectedId = ref<string | null>(null);
const previewId = ref<string | null>(typeof route.query.preview === 'string' ? route.query.preview : null);
const busySuggestion = ref<string | null>(null);
const ignored = useIgnoredSuggestions();

useEvents((event) => {
  if (event.type === 'file.updated' || event.type === 'file.deleted' || event.type === 'drive.changed') void refresh();
});

const files = computed(() => (data.value?.files ?? []) as DriveFile[]);
const folders = computed(() => data.value?.folders ?? []);
const path = computed(() => data.value?.path ?? []);
const currentFolder = computed(() => data.value?.folder ?? null);
const searching = computed(() => data.value?.view === 'search');
/** Fichiers venant de plusieurs dossiers (recherche, récents, favoris) : on affiche leur chemin. */
const showsPaths = computed(() => data.value?.view !== 'folder');
const quota = computed(() => data.value?.quota ?? { usedBytes: 0, maxBytes: 0 });

function resetFilters() {
  selection.value = new Set();
  selectedId.value = null;
  search.value = '';
  debouncedSearch.value = '';
  category.value = null;
}

function openFolder(id: string | null) {
  resetFilters();
  void router.push({ query: id ? { dossier: id } : {} });
}

function openView(target: View) {
  resetFilters();
  void router.push({ query: VIEW_QUERY[target] ? { vue: VIEW_QUERY[target] } : {} });
}

/* ───────── Affichage : vue, tri ───────── */

type Layout = 'list' | 'grid';
type SortKey = 'recent' | 'name' | 'size' | 'type';
const SORTS: Record<SortKey, string> = { recent: 'Plus récents', name: 'Nom', size: 'Taille', type: 'Type' };
const layout = ref<Layout>('list');
const sort = ref<SortKey>('recent');

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('drive.display') ?? '{}') as { view?: Layout; sort?: SortKey };
    if (saved.view === 'list' || saved.view === 'grid') layout.value = saved.view;
    if (saved.sort && saved.sort in SORTS) sort.value = saved.sort;
  } catch {
    // Préférence d'affichage seulement : on garde les valeurs par défaut.
  }
});
watch([layout, sort], () => {
  try {
    localStorage.setItem('drive.display', JSON.stringify({ view: layout.value, sort: sort.value }));
  } catch {
    // Stockage indisponible (navigation privée) : sans conséquence.
  }
});

const sortItems = computed<MenuItem[]>(() => (Object.keys(SORTS) as SortKey[]).map((key) => ({
  label: SORTS[key],
  icon: 'sort',
  checked: sort.value === key,
  action: () => (sort.value = key),
})));

const extension = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
const sortedFiles = computed(() => {
  // La recherche est déjà triée par pertinence.
  if (searching.value) return files.value;
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

/* ───────── Sélection multiple (cases à cocher, ou appui long sur mobile) ───────── */

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

/** Clic sur un fichier : en mode sélection il coche/décoche, sinon il ouvre le détail. */
function onFileClick(id: string) {
  if (longPressed) {
    longPressed = false;
    return;
  }
  if (selectionCount.value) toggleSelection(id);
  else selectedId.value = id;
}

const LONG_PRESS_MS = 450;
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressed = false;

function onTouchStart(id: string) {
  longPressed = false;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longPressed = true;
    toggleSelection(id);
    navigator.vibrate?.(15);
  }, LONG_PRESS_MS);
}

function cancelPress() {
  clearTimeout(pressTimer);
}

watch(files, (list) => {
  // Retire de la sélection les fichiers qui ne sont plus affichés (supprimés, déplacés ailleurs).
  const ids = new Set(list.map((file) => file.id));
  if ([...selection.value].some((id) => !ids.has(id))) selection.value = new Set([...selection.value].filter((id) => ids.has(id)));
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectionCount.value && !document.querySelector('dialog[open]')) selection.value = new Set();
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

/* ───────── Actions ───────── */

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

async function run(task: () => Promise<unknown>, success?: string | { text: string; undo?: () => Promise<unknown> }) {
  error.value = null;
  notice.value = null;
  try {
    await task();
    if (success) notice.value = typeof success === 'string' ? { text: success } : success;
    await refresh();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

async function undoNotice() {
  const undo = notice.value?.undo;
  if (!undo) return;
  await run(undo, 'Opération annulée.');
}

const prompt = ref<{ open: (options: { title: string; label: string; value?: string; confirm?: string }) => void } | null>(null);
let onPrompt: ((value: string) => Promise<void>) | null = null;

function askText(options: { title: string; label: string; value?: string; confirm?: string }, handler: (value: string) => Promise<void>) {
  onPrompt = handler;
  prompt.value?.open(options);
}

async function submitPrompt(value: string) {
  await onPrompt?.(value);
}

function newFolder() {
  const parent = view.value === 'folder' ? folderId.value : null;
  askText({ title: 'Nouveau dossier', label: currentFolder.value ? `Dans « ${currentFolder.value.name} »` : 'Dans Mon drive', confirm: 'Créer' }, (name) =>
    run(() => $fetch<unknown>('/api/folders', { method: 'POST', body: { name, parentId: parent } }), `Dossier « ${name} » créé.`));
}

function renameFolder(folder: DriveFolder) {
  askText({ title: 'Renommer le dossier', label: 'Nom', value: folder.name, confirm: 'Renommer' }, (name) =>
    run(() => $fetch<unknown>(`/api/folders/${folder.id}`, { method: 'PATCH', body: { name } })));
}

function renameFileItem(file: FileItem) {
  askText({ title: 'Renommer le fichier', label: 'Nom', value: file.name, confirm: 'Renommer' }, (name) =>
    run(() => $fetch<unknown>(`/api/files/${file.id}`, { method: 'PATCH', body: { name } })));
}

function toggleStar(kind: 'file' | 'folder', item: { id: string; starred?: boolean }) {
  const url = kind === 'file' ? `/api/files/${item.id}` : `/api/folders/${item.id}`;
  void run(() => $fetch<unknown>(url, { method: 'PATCH', body: { starred: !item.starred } }));
}

const moveDialog = ref<{ open: (options: { title: string; current: string | null; excludeFolderId?: string }) => Promise<void> } | null>(null);
let onMove: ((target: string | null) => Promise<void>) | null = null;

function moveFilesTo(ids: string[]) {
  onMove = (target) => run(async () => {
    await $fetch<unknown>('/api/files/move', { method: 'POST', body: { fileIds: ids, folderId: target } });
    selection.value = new Set();
  }, `${plural(ids.length, 'fichier')} déplacé${ids.length > 1 ? 's' : ''}.`);
  const current = ids.length === 1 ? files.value.find((file) => file.id === ids[0])?.folderId ?? null : folderId.value;
  void moveDialog.value?.open({ title: ids.length > 1 ? `Déplacer ${ids.length} fichiers` : 'Déplacer le fichier', current });
}

function moveFolder(folder: DriveFolder) {
  onMove = (target) => run(() => $fetch<unknown>(`/api/folders/${folder.id}`, { method: 'PATCH', body: { parentId: target } }), `Dossier « ${folder.name} » déplacé.`);
  void moveDialog.value?.open({ title: `Déplacer « ${folder.name} »`, current: folder.parentId, excludeFolderId: folder.id });
}

async function submitMove(target: string | null) {
  await onMove?.(target);
}

/* Suppression d'un dossier : garder le contenu (remonte d'un niveau) ou tout mettre à la corbeille. */
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
    mode === 'keep'
      ? `Dossier « ${folder.name} » supprimé, son contenu a été conservé.`
      : `Dossier « ${folder.name} » supprimé, ${plural(folder.fileCount, 'fichier')} dans la corbeille.`);
}

/** Corbeille : pas de confirmation, l'opération s'annule depuis le message (ou la corbeille pendant 30 jours). */
async function trash(ids: string[]) {
  const label = ids.length > 1 ? plural(ids.length, 'fichier') : `« ${files.value.find((file) => file.id === ids[0])?.name} »`;
  await run(async () => {
    await $fetch<unknown>('/api/files/delete', { method: 'POST', body: { fileIds: ids } });
    if (selectedId.value && ids.includes(selectedId.value)) selectedId.value = null;
    selection.value = new Set();
  }, {
    text: `${label} mis à la corbeille.`,
    undo: () => $fetch<unknown>('/api/trash/restore', { method: 'POST', body: { fileIds: ids } }),
  });
}

async function reindex(id: string) {
  await run(() => $fetch<unknown>(`/api/files/${id}/reindex`, { method: 'POST' }));
}

async function onUploaded() {
  await Promise.all([refresh(), refreshMe()]);
}

function download(url: string) {
  window.location.assign(url);
}

const shareDialog = ref<{ open: (file: FileItem) => Promise<void> } | null>(null);

async function toggleAutoFile() {
  const enabled = !settings.value?.settings.autoFileDocuments;
  await run(async () => {
    await $fetch<unknown>('/api/settings', { method: 'PATCH', body: { autoFileDocuments: enabled } });
    await refreshSettings();
  }, enabled
    ? 'Rangement automatique activé : chaque nouveau document analysé ira dans le dossier de sa catégorie.'
    : 'Rangement automatique désactivé.');
}

/** Question posée à l'agent : recherche par le sens, au-delà des mots exacts. */
async function askAgent() {
  const query = search.value.trim();
  if (!query) return;
  await run(async () => {
    const { conversationId } = await $fetch('/api/conversations', { method: 'POST', body: { content: `Dans mes documents : ${query}` } });
    await navigateTo(`/chat/${conversationId}`);
  });
}

const moreItems = computed<MenuItem[]>(() => [
  { label: 'Nouveau dossier', icon: 'folder-solid', action: newFolder },
  {
    label: currentFolder.value ? `Télécharger « ${currentFolder.value.name} » (.zip)` : 'Télécharger tout le drive (.zip)',
    icon: 'arrow-up-from-bracket',
    action: () => download(`/api/drive/download${folderId.value ? `?folderId=${folderId.value}` : ''}`),
  },
  { label: 'Ranger automatiquement', icon: 'wand', checked: settings.value?.settings.autoFileDocuments ?? false, action: toggleAutoFile },
  { label: 'Corbeille', icon: 'trash', action: () => void navigateTo('/drive/corbeille') },
]);

function folderMenu(folder: DriveFolder): MenuItem[] {
  return [
    { label: 'Ouvrir', icon: 'folder-open', action: () => openFolder(folder.id) },
    { label: folder.starred ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: folder.starred ? 'star' : 'star-outline', action: () => toggleStar('folder', folder) },
    { label: 'Renommer', icon: 'pen-to-square', action: () => renameFolder(folder) },
    { label: 'Déplacer…', icon: 'file-export', action: () => moveFolder(folder) },
    { label: 'Télécharger (.zip)', icon: 'arrow-up-from-bracket', action: () => download(`/api/drive/download?folderId=${folder.id}`) },
    { label: 'Supprimer', icon: 'trash', danger: true, action: () => askDeleteFolder(folder) },
  ];
}

function fileMenu(file: DriveFile): MenuItem[] {
  return [
    { label: 'Aperçu', icon: 'eye', action: () => (previewId.value = file.id) },
    { label: file.starred ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: file.starred ? 'star' : 'star-outline', action: () => toggleStar('file', file) },
    { label: 'Partager par lien…', icon: 'paper-plane', action: () => void shareDialog.value?.open(file) },
    { label: 'Renommer', icon: 'pen-to-square', action: () => renameFileItem(file) },
    { label: 'Déplacer…', icon: 'file-export', action: () => moveFilesTo([file.id]) },
    ...(showsPaths.value ? [{ label: 'Ouvrir le dossier', icon: 'folder-open' as const, action: () => openFolder(file.folderId ?? null) }] : []),
    { label: 'Télécharger', icon: 'arrow-up-from-bracket', action: () => download(`/api/files/${file.id}/content?download=1`) },
    { label: 'Mettre à la corbeille', icon: 'trash', danger: true, action: () => trash([file.id]) },
  ];
}

/* ───────── Glisser-déposer (souris) : fichiers et dossiers vers un dossier ───────── */

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
    if (folder === folderId.value && view.value === 'folder') return;
    await run(async () => {
      await $fetch<unknown>('/api/files/move', { method: 'POST', body: { fileIds: ids, folderId: folder } });
      selection.value = new Set();
    }, `${plural(ids.length, 'fichier')} déplacé${ids.length > 1 ? 's' : ''}.`);
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
        ? `Rejoint le dossier « ${suggested} », avec ${plural(similar, 'document')} similaire${similar > 1 ? 's' : ''}`
        : `Crée le dossier « ${suggested} » et y range le document`,
      icon: 'folder',
      tone: 'tone-info',
      accept: async () => {
        await $fetch<unknown>(`/api/files/${file.id}`, { method: 'PATCH', body: { category: suggested, folderPath: suggested } });
        await refresh();
        notice.value = { text: `${file.name} est rangé dans le dossier « ${suggested} ».` };
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
        notice.value = { text: 'Rappel programmé : vous recevrez une notification la veille.' };
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
const sectionTitle = computed(() => (searching.value ? 'Résultats dans tout le drive' : view.value !== 'folder' ? VIEWS[view.value] : currentFolder.value?.name ?? 'Mon drive'));
const isEmpty = computed(() => !folders.value.length && !files.value.length);
const emptyState = computed(() => {
  if (searching.value) return { title: 'Aucun résultat', text: 'Essayez un autre mot, ou demandez à votre agent : il cherche aussi par le sens.' };
  if (view.value === 'starred') return { title: 'Aucun favori', text: 'Ajoutez un fichier ou un dossier aux favoris depuis son menu « ••• » pour le retrouver ici.' };
  if (view.value === 'recent') return { title: 'Aucun document', text: 'Les derniers documents ajoutés apparaîtront ici.' };
  if (currentFolder.value) return { title: 'Dossier vide', text: 'Déposez un document ici, ou créez un sous-dossier.' };
  return { title: 'Drive vide', text: 'Déposez un document : votre agent l’analysera, puis classez-le dans des dossiers.' };
});
const backLink = computed(() => {
  if (!currentFolder.value) return undefined;
  const parent = path.value.at(-2);
  return parent ? `/drive?dossier=${parent.id}` : '/drive';
});
</script>

<template>
  <div>
    <PageHeader :title="currentFolder?.name ?? 'Drive'" :back="backLink">
      <template #actions>
        <StorageMeter :used-bytes="quota.usedBytes" :max-bytes="quota.maxBytes" compact />
        <ActionMenu :items="moreItems" label="Plus d’actions sur le drive" />
      </template>
      <template #below>
        <label class="input-group search">
          <AppIcon name="search" :size="14" />
          <span class="sr-only">Chercher dans le drive</span>
          <input v-model="search" type="search" placeholder="Chercher un nom ou un mot du document…">
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
        <nav class="views segmented" aria-label="Vues du drive">
          <button v-for="(label, key) in VIEWS" :key="key" type="button" :class="{ active: view === key && !searching }" :aria-current="view === key ? 'page' : undefined" @click="openView(key)">
            <AppIcon :name="key === 'folder' ? 'house' : key === 'recent' ? 'clock' : 'star'" :size="12" />{{ label }}
          </button>
          <NuxtLink to="/drive/corbeille" class="view-link"><AppIcon name="trash" :size="12" />Corbeille</NuxtLink>
        </nav>

        <FileUploader
          v-if="view === 'folder' && !searching"
          :used-bytes="quota.usedBytes"
          :max-bytes="quota.maxBytes"
          :folder-id="folderId"
          :folder-name="currentFolder?.name"
          @uploaded="onUploaded"
        />
        <p v-if="loadError" class="alert alert-error" role="alert"><AppIcon name="circle-exclamation" :size="14" />{{ getErrorMessage(loadError, 'Ce dossier est introuvable.') }}</p>
        <p v-if="error" class="alert alert-error" role="alert"><AppIcon name="circle-exclamation" :size="14" />{{ error }}</p>
        <p v-if="notice" class="alert alert-success notice" role="status">
          <AppIcon name="circle-check" :size="14" /><span class="grow">{{ notice.text }}</span>
          <button v-if="notice.undo" class="text-btn" type="button" @click="undoNotice">Annuler</button>
        </p>

        <!-- Fil d'Ariane : chaque niveau est aussi une cible de dépôt. -->
        <nav v-if="view === 'folder' && !searching" class="crumbs" aria-label="Emplacement">
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

        <div class="toolbar" :class="{ selecting: selectionCount > 0 }">
          <label v-if="files.length" class="check-all small strong">
            <input type="checkbox" :checked="allSelected" :indeterminate="selectionCount > 0 && !allSelected" @change="toggleAll">
            {{ selectionCount ? `${selectionCount} sélectionné${selectionCount > 1 ? 's' : ''}` : sectionTitle }}
          </label>
          <h2 v-else class="small strong">{{ sectionTitle }}</h2>
          <span class="grow" />
          <template v-if="selectionCount">
            <button class="btn btn-sm" type="button" @click="moveFilesTo([...selection])"><AppIcon name="file-export" :size="12" />Déplacer</button>
            <button class="btn btn-sm btn-danger" type="button" @click="trash([...selection])"><AppIcon name="trash" :size="12" />Corbeille</button>
            <button class="icon-btn small-btn" type="button" aria-label="Annuler la sélection" @click="selection = new Set()"><AppIcon name="xmark" :size="11" /></button>
          </template>
          <template v-else>
            <ActionMenu v-if="!searching" :items="sortItems" :label="`Trier : ${SORTS[sort]}`" />
            <div class="segmented layout-toggle" role="group" aria-label="Affichage">
              <button type="button" :class="{ active: layout === 'list' }" aria-label="Liste" :aria-pressed="layout === 'list'" @click="layout = 'list'"><AppIcon name="list-check" :size="12" /></button>
              <button type="button" :class="{ active: layout === 'grid' }" aria-label="Grille" :aria-pressed="layout === 'grid'" @click="layout = 'grid'"><AppIcon name="grid" :size="12" /></button>
            </div>
          </template>
        </div>
        <p v-if="selectionCount === 0 && files.length" class="touch-hint tiny muted">Astuce : appui long sur un fichier pour en sélectionner plusieurs.</p>

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
                <strong class="ellipsis">{{ folder.name }}<AppIcon v-if="folder.starred" name="star" :size="10" class="star" label="Favori" /></strong>
                <span class="tiny muted">{{ plural(folder.fileCount, 'fichier') }}{{ folder.sizeBytes ? ` · ${formatBytes(folder.sizeBytes)}` : '' }}</span>
              </span>
            </button>
            <ActionMenu :items="folderMenu(folder)" :label="`Actions pour ${folder.name}`" />
          </div>
        </section>

        <!-- Fichiers -->
        <section v-if="sortedFiles.length" aria-label="Fichiers" :class="{ selecting: selectionCount > 0 }">
          <div v-if="layout === 'list'" class="stack">
            <div
              v-for="file in sortedFiles"
              :key="file.id"
              class="file-line"
              :class="{ checked: selection.has(file.id) }"
              draggable="true"
              @dragstart="onDragStart($event, { kind: 'file', id: file.id })"
              @touchstart.passive="onTouchStart(file.id)"
              @touchmove.passive="cancelPress"
              @touchend="cancelPress"
              @contextmenu="longPressed && $event.preventDefault()"
            >
              <input type="checkbox" class="pick" :checked="selection.has(file.id)" :aria-label="`Sélectionner ${file.name}`" @change="toggleSelection(file.id)">
              <div class="grow">
                <FileRow :file="file" :selected="selected?.id === file.id && !selectionCount" @select="onFileClick" @preview="previewId = $event" @delete="trash([$event])" @reindex="reindex">
                  <template #actions>
                    <AppIcon v-if="file.starred" name="star" :size="12" class="star" label="Favori" />
                    <ActionMenu :items="fileMenu(file)" :label="`Actions pour ${file.name}`" />
                  </template>
                </FileRow>
                <DriveSnippet v-if="file.snippet" :text="file.snippet" class="snippet" />
                <button v-if="showsPaths" type="button" class="path tiny muted" @click="openFolder(file.folderId ?? null)">
                  <AppIcon name="folder" :size="10" />{{ file.path || 'Mon drive' }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="tiles">
            <article
              v-for="file in sortedFiles"
              :key="file.id"
              class="tile"
              :class="{ checked: selection.has(file.id), active: selected?.id === file.id && !selectionCount }"
              draggable="true"
              @dragstart="onDragStart($event, { kind: 'file', id: file.id })"
              @touchstart.passive="onTouchStart(file.id)"
              @touchmove.passive="cancelPress"
              @touchend="cancelPress"
              @contextmenu="longPressed && $event.preventDefault()"
              @click="onFileClick(file.id)"
              @dblclick="previewId = file.id"
            >
              <button type="button" class="thumb" :aria-label="`Aperçu de ${file.name}`" @click.stop="selectionCount ? toggleSelection(file.id) : (previewId = file.id)">
                <img v-if="isImage(file)" :src="`/api/files/${file.id}/content`" alt="" loading="lazy">
                <FileTypeIcon v-else :mime-type="file.mimeType" :size="44" />
              </button>
              <input type="checkbox" class="pick tile-pick" :checked="selection.has(file.id)" :aria-label="`Sélectionner ${file.name}`" @click.stop @change="toggleSelection(file.id)">
              <div class="tile-meta">
                <span class="grow">
                  <strong class="ellipsis">{{ file.name }}</strong>
                  <span class="tiny muted ellipsis">{{ showsPaths ? file.path || 'Mon drive' : fileSubtitle(file) }}</span>
                </span>
                <AppIcon v-if="file.starred" name="star" :size="11" class="star" label="Favori" />
                <ActionMenu :items="fileMenu(file)" :label="`Actions pour ${file.name}`" />
              </div>
            </article>
          </div>
        </section>

        <div v-if="searching && search.trim()" class="ask-agent card">
          <span class="icon-tile tone-primary"><AppIcon name="microchip" :size="14" /></span>
          <span class="grow small">
            <strong>Pas ce que vous cherchez ?</strong>
            <span class="muted">Votre agent cherche aussi par le sens (« mon contrat d’assurance auto »).</span>
          </span>
          <button class="btn btn-sm btn-ink" type="button" @click="askAgent">Demander à l’agent</button>
        </div>

        <div v-if="isEmpty && !loadError && !searching" class="empty-state">
          <span class="icon-tile tone-info"><AppIcon :name="view === 'starred' ? 'star' : 'folder-open'" :size="16" /></span>
          <strong>{{ emptyState.title }}</strong>
          <p>{{ emptyState.text }}</p>
          <button v-if="view === 'folder'" class="btn btn-sm" type="button" @click="newFolder"><AppIcon name="plus" :size="11" />Nouveau dossier</button>
        </div>
        <p v-else-if="isEmpty && searching" class="empty-state small">{{ emptyState.text }}</p>
      </div>

      <aside v-if="selected" class="col-side stack">
        <FileDetails :file="selected" @preview="previewId = $event" @reindex="reindex" @delete="trash([$event])" />
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
    <DriveShareDialog ref="shareDialog" />

    <dialog ref="deleteDialog" class="confirm" aria-labelledby="delete-title" @click.self="deleteDialog?.close()">
      <div v-if="folderToDelete" class="stack">
        <h2 id="delete-title">Supprimer « {{ folderToDelete.name }} » ?</h2>
        <p class="small muted">
          {{ folderToDelete.fileCount
            ? `Ce dossier contient ${plural(folderToDelete.fileCount, 'fichier')} (${formatBytes(folderToDelete.sizeBytes)}).`
            : 'Ce dossier ne contient aucun fichier.' }}
        </p>
        <button class="btn btn-ink btn-block" type="button" @click="deleteFolder('keep')">
          Supprimer le dossier, garder le contenu
        </button>
        <button v-if="folderToDelete.fileCount" class="btn btn-danger btn-block" type="button" @click="deleteFolder('all')">
          Mettre aussi les {{ plural(folderToDelete.fileCount, 'fichier') }} à la corbeille
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

.star {
  margin-left: 6px;
  color: var(--amber);
}

.drive {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Vues */
.views {
  align-self: flex-start;
  max-width: 100%;
  overflow-x: auto;
}

.views button,
.view-link {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  font-size: 13px;
  white-space: nowrap;
}

.view-link {
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-weight: 700;
  text-decoration: none;
}

.notice .grow {
  flex: 1;
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

.toolbar.selecting {
  padding: 6px 8px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--on-ink);
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

.layout-toggle button {
  min-width: 36px;
  min-height: 32px;
}

.touch-hint {
  display: none;
  margin: -8px 0 0;
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
  -webkit-touch-callout: none;
  user-select: none;
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
  border-color: var(--info);
  background: color-mix(in srgb, var(--info-soft) 50%, var(--surface));
}

.snippet {
  margin-top: 6px;
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
  -webkit-touch-callout: none;
  user-select: none;
}

.tile.active {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink);
}

.tile.checked {
  border-color: var(--info);
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
  pointer-events: none;
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

.ask-agent {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
}

.ask-agent .grow {
  display: flex;
  flex-direction: column;
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

/* Écrans tactiles : cases cachées hors sélection (l'appui long l'active), astuce affichée. */
@media (pointer: coarse) {
  .touch-hint {
    display: block;
  }

  section:not(.selecting) .pick {
    display: none;
  }

  .toolbar:not(.selecting) .check-all input {
    display: none;
  }
}

@media (max-width: 480px) {
  .folders,
  .tiles {
    grid-template-columns: 1fr 1fr;
  }

  /* Rangées compactes : l'aperçu et le statut « Analysé » sont dans le menu et le détail, le nom garde la place. */
  .file-line :deep(.eye),
  .file-line :deep(.badge.tone-primary) {
    display: none;
  }

  .file-line {
    gap: 8px;
  }

  .ask-agent {
    flex-wrap: wrap;
  }
}
</style>
