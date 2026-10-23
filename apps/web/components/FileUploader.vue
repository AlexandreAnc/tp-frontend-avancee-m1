<script setup lang="ts">
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '@app/shared';

const props = defineProps<{ usedBytes: number; maxBytes: number; folderId?: string | null; folderName?: string }>();
const emit = defineEmits<{ uploaded: [] }>();

const filesInput = ref<HTMLInputElement | null>(null);
const photosInput = ref<HTMLInputElement | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const uploading = ref<{ name: string; index: number; total: number } | null>(null);
const errors = ref<string[]>([]);

const remaining = computed(() => Math.max(0, props.maxBytes - props.usedBytes));
const maxSizeLabel = formatBytes(MAX_FILE_SIZE_BYTES);
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic';

/** Contrôles de confort : le serveur revérifie tout (taille pendant l'envoi, type par le contenu, quota). */
function precheck(file: File, available: number): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!(ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return `${file.name} : format non pris en charge (PDF, Word, Excel, texte, images).`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) return `${file.name} : le fichier dépasse ${maxSizeLabel}.`;
  if (file.size > available) {
    return `${file.name} : espace insuffisant (${formatBytes(file.size)} pour ${formatBytes(available)} disponibles).`;
  }
  return null;
}

async function upload(files: File[]) {
  errors.value = [];
  let available = remaining.value;

  for (const [index, file] of files.entries()) {
    const problem = precheck(file, available);
    if (problem) {
      errors.value.push(problem);
      continue;
    }
    uploading.value = { name: file.name, index: index + 1, total: files.length };
    try {
      await $fetch('/api/files', {
        method: 'POST',
        body: file,
        headers: {
          'x-file-name': encodeURIComponent(file.name),
          'content-type': 'application/octet-stream',
          ...(props.folderId ? { 'x-folder-id': props.folderId } : {}),
        },
      });
      available -= file.size;
      emit('uploaded');
    } catch (error) {
      errors.value.push(`${file.name} : ${getErrorMessage(error)}`);
    }
  }
  uploading.value = null;
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  void upload([...(event.dataTransfer?.files ?? [])]);
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement;
  void upload([...(target.files ?? [])]);
  target.value = '';
}

/** Ouvre le sélecteur de fichiers (utilisé par le bouton « Ajouter » des états vides). */
defineExpose({ pick: () => filesInput.value?.click() });
</script>

<template>
  <section
    class="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-[22px] text-center [transition:background_0.15s,border-color_0.15s]"
    :class="remaining <= 0 ? 'border-rose/40 bg-danger-soft/60' : dragging ? 'border-primary bg-primary-soft' : 'border-emerald-deep/40 bg-primary-soft/60'"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <span class="mb-2 inline-flex size-12 items-center justify-center rounded-lg bg-surface text-primary-strong shadow-sm"><AppIcon name="cloud-upload" :size="18" /></span>
    <template v-if="uploading">
      <strong class="inline-flex items-center gap-2 text-sm font-extrabold"><span class="spinner" /> Envoi de {{ uploading.name }}…</strong>
      <span class="text-xs text-muted">{{ uploading.index }} / {{ uploading.total }}</span>
    </template>
    <template v-else-if="remaining <= 0">
      <strong class="inline-flex items-center gap-2 text-sm font-extrabold">Stockage plein</strong>
      <span class="text-xs text-muted">{{ formatBytes(maxBytes) }} utilisés : supprimez des fichiers pour en ajouter.</span>
    </template>
    <template v-else>
      <strong class="inline-flex items-center gap-2 text-sm font-extrabold">Déposez un document{{ folderName ? ` dans « ${folderName} »` : '' }}</strong>
      <span class="text-xs text-muted">PDF, Word, Excel, images · {{ maxSizeLabel }} max · l'agent l'analyse sur votre PC</span>
    </template>

    <div class="mt-4 grid w-full grid-cols-[repeat(3,1fr)] gap-2">
      <button type="button" class="flex h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border bg-surface px-1.5 py-px text-[12px] font-bold text-text disabled:cursor-not-allowed disabled:opacity-50" :disabled="remaining <= 0 || !!uploading" @click="cameraInput?.click()">
        <AppIcon name="camera" :size="16" /><span>Scanner</span>
      </button>
      <button type="button" class="flex h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border bg-surface px-1.5 py-px text-[12px] font-bold text-text disabled:cursor-not-allowed disabled:opacity-50" :disabled="remaining <= 0 || !!uploading" @click="filesInput?.click()">
        <AppIcon name="folder-open" :size="16" /><span>Fichiers</span>
      </button>
      <button type="button" class="flex h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border bg-surface px-1.5 py-px text-[12px] font-bold text-text disabled:cursor-not-allowed disabled:opacity-50" :disabled="remaining <= 0 || !!uploading" @click="photosInput?.click()">
        <AppIcon name="image" :size="16" /><span>Photos</span>
      </button>
    </div>

    <input ref="filesInput" type="file" multiple :accept="ALLOWED_FILE_EXTENSIONS.join(',')" class="sr-only" @change="onPick">
    <input ref="photosInput" type="file" multiple :accept="IMAGE_ACCEPT" class="sr-only" @change="onPick">
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="sr-only" @change="onPick">
  </section>
  <p v-for="error in errors" :key="error" class="alert alert-error" role="alert"><AppIcon name="circle-exclamation" :size="14" />{{ error }}</p>
</template>
