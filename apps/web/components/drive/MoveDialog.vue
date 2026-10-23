<script setup lang="ts">
interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
}

const emit = defineEmits<{ move: [folderId: string | null] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const tree = ref<FolderNode[]>([]);
const selected = ref<string | null>(null);
const expanded = ref(new Set<string>());
/** Dossiers exclus (un dossier ne peut pas aller dans lui-même ou ses sous-dossiers). */
const excluded = ref(new Set<string>());
const title = ref('');
const newName = ref('');
const error = ref<string | null>(null);

async function load() {
  tree.value = (await $fetch<{ folders: FolderNode[] }>('/api/folders')).folders;
}

function descendants(rootId: string) {
  const result = new Set([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of tree.value) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        added = true;
      }
    }
  }
  return result;
}

async function open(options: { title: string; current: string | null; excludeFolderId?: string }) {
  title.value = options.title;
  selected.value = options.current;
  error.value = null;
  newName.value = '';
  await load();
  excluded.value = options.excludeFolderId ? descendants(options.excludeFolderId) : new Set();
  // Déplie le chemin du dossier courant.
  let cursor = tree.value.find((folder) => folder.id === options.current);
  while (cursor?.parentId) {
    expanded.value.add(cursor.parentId);
    cursor = tree.value.find((folder) => folder.id === cursor!.parentId);
  }
  dialog.value?.showModal();
}

interface Row {
  folder: FolderNode;
  depth: number;
  hasChildren: boolean;
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of tree.value.filter((item) => item.parentId === parentId)) {
      const hasChildren = tree.value.some((item) => item.parentId === folder.id);
      list.push({ folder, depth, hasChildren });
      if (expanded.value.has(folder.id)) walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return list;
});

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

async function createHere() {
  if (!newName.value.trim()) return;
  error.value = null;
  try {
    const { folder } = await $fetch<{ folder: FolderNode }>('/api/folders', { method: 'POST', body: { name: newName.value, parentId: selected.value } });
    await load();
    if (selected.value) expanded.value.add(selected.value);
    selected.value = folder.id;
    newName.value = '';
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

function confirm() {
  emit('move', selected.value);
  dialog.value?.close();
}

defineExpose({ open });
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(480px,calc(100%-24px))] rounded-xl border bg-surface p-5 text-text backdrop:bg-night/45"
    aria-labelledby="move-title"
    @click.self="dialog?.close()"
  >
    <div class="flex flex-col gap-3 *:min-w-0">
      <h2 id="move-title">{{ title }}</h2>
      <div class="card card-flush max-h-[50dvh] overflow-y-auto p-1.5" role="tree">
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2.5 py-[9px] text-left font-bold"
          :class="{ 'bg-ink text-on-ink': selected === null }"
          role="treeitem"
          :aria-selected="selected === null"
          @click="selected = null"
        >
          <AppIcon name="house" :size="13" />Mon drive (racine)
        </button>
        <div v-for="row in rows" :key="row.folder.id" class="flex items-center gap-0.5" :style="{ paddingLeft: `${12 + row.depth * 18}px` }">
          <button
            v-if="row.hasChildren"
            type="button"
            class="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center text-muted"
            :aria-label="expanded.has(row.folder.id) ? 'Replier' : 'Déplier'"
            @click="toggle(row.folder.id)"
          >
            <AppIcon name="chevron-down" :size="10" :class="{ '-rotate-90': !expanded.has(row.folder.id) }" />
          </button>
          <span v-else class="size-5 shrink-0" />
          <button
            type="button"
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2.5 py-[9px] text-left font-bold disabled:cursor-not-allowed disabled:opacity-40"
            :class="{ 'bg-ink text-on-ink': selected === row.folder.id }"
            role="treeitem"
            :aria-selected="selected === row.folder.id"
            :disabled="excluded.has(row.folder.id)"
            @click="selected = row.folder.id"
          >
            <AppIcon :name="selected === row.folder.id ? 'folder-open' : 'folder'" :size="13" />{{ row.folder.name }}
          </button>
        </div>
      </div>
      <form class="flex items-center gap-2" @submit.prevent="createHere">
        <input v-model="newName" class="input min-w-0 flex-1" maxlength="120" placeholder="Nouveau dossier ici…" aria-label="Nom du nouveau dossier">
        <button class="btn" type="submit" :disabled="!newName.trim()"><AppIcon name="plus" :size="12" />Créer</button>
      </form>
      <p v-if="error" class="alert alert-error">{{ error }}</p>
      <div class="grid grid-cols-[1fr_1fr] gap-2">
        <button class="btn" type="button" @click="dialog?.close()">Annuler</button>
        <button class="btn btn-ink" type="button" @click="confirm">Déplacer ici</button>
      </div>
    </div>
  </dialog>
</template>
