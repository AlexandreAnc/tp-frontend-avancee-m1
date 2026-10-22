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
  <dialog ref="dialog" class="move" aria-labelledby="move-title" @click.self="dialog?.close()">
    <div class="stack">
      <h2 id="move-title">{{ title }}</h2>
      <div class="tree card card-flush" role="tree">
        <button type="button" class="node" role="treeitem" :aria-selected="selected === null" :class="{ active: selected === null }" @click="selected = null">
          <AppIcon name="house" :size="13" />Mon drive (racine)
        </button>
        <div v-for="row in rows" :key="row.folder.id" class="node-row" :style="{ paddingLeft: `${12 + row.depth * 18}px` }">
          <button v-if="row.hasChildren" type="button" class="expand" :aria-label="expanded.has(row.folder.id) ? 'Replier' : 'Déplier'" @click="toggle(row.folder.id)">
            <AppIcon name="chevron-down" :size="10" :class="{ closed: !expanded.has(row.folder.id) }" />
          </button>
          <span v-else class="expand" />
          <button
            type="button"
            class="node"
            role="treeitem"
            :aria-selected="selected === row.folder.id"
            :class="{ active: selected === row.folder.id }"
            :disabled="excluded.has(row.folder.id)"
            @click="selected = row.folder.id"
          >
            <AppIcon :name="selected === row.folder.id ? 'folder-open' : 'folder'" :size="13" />{{ row.folder.name }}
          </button>
        </div>
      </div>
      <form class="row" @submit.prevent="createHere">
        <input v-model="newName" class="input grow" maxlength="120" placeholder="Nouveau dossier ici…" aria-label="Nom du nouveau dossier">
        <button class="btn" type="submit" :disabled="!newName.trim()"><AppIcon name="plus" :size="12" />Créer</button>
      </form>
      <p v-if="error" class="alert alert-error">{{ error }}</p>
      <div class="buttons">
        <button class="btn" type="button" @click="dialog?.close()">Annuler</button>
        <button class="btn btn-ink" type="button" @click="confirm">Déplacer ici</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.move {
  width: min(480px, calc(100% - 24px));
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
}

.move::backdrop {
  background: rgb(28 31 35 / 0.45);
}

.tree {
  max-height: 50dvh;
  overflow-y: auto;
  padding: 6px;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.node {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.node:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.node.active {
  background: var(--ink);
  color: var(--on-ink);
}

.expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.closed {
  transform: rotate(-90deg);
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
