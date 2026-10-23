<script setup lang="ts">
import type { FileItem } from './FileRow.vue';

const props = defineProps<{ file: FileItem | null }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const text = ref<string | null>(null);
const totalLength = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
/** Safari affiche le HEIC nativement ; les autres navigateurs non. */
const heicSupported = ref(false);
const imageFailed = ref(false);

const PAGE = 20_000;

type Mode = 'pdf' | 'image' | 'markdown' | 'text' | 'extracted';
const mode = computed<Mode | null>(() => {
  const type = props.file?.mimeType ?? '';
  if (!props.file) return null;
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/heic') return heicSupported.value && !imageFailed.value ? 'image' : 'extracted';
  if (type.startsWith('image/')) return imageFailed.value ? 'extracted' : 'image';
  if (type === 'text/markdown') return 'markdown';
  if (type === 'text/plain') return 'text';
  return 'extracted';
});

const contentUrl = computed(() => (props.file ? `/api/files/${props.file.id}/content` : ''));
const html = computed(() => (text.value !== null && mode.value === 'markdown' ? renderMarkdown(text.value) : ''));

/** Texte brut (txt, md) téléchargé tel quel ; texte extrait par l'agent pour les autres formats. */
async function loadText(append = false) {
  if (!props.file) return;
  loading.value = true;
  error.value = null;
  try {
    if (mode.value === 'text' || mode.value === 'markdown') {
      text.value = await $fetch<string>(contentUrl.value, { responseType: 'text' });
      totalLength.value = text.value.length;
    } else {
      const offset = append ? text.value?.length ?? 0 : 0;
      const page = await $fetch<{ text: string; totalLength: number }>(`/api/files/${props.file.id}/text`, { query: { offset, length: PAGE } });
      text.value = append ? `${text.value ?? ''}${page.text}` : page.text;
      totalLength.value = page.totalLength;
    }
  } catch (caught) {
    error.value = getErrorMessage(caught, "Impossible d'afficher ce document.");
  } finally {
    loading.value = false;
  }
}

watch(() => props.file, (file) => {
  text.value = null;
  imageFailed.value = false;
  if (!file) {
    dialog.value?.close();
    return;
  }
  dialog.value?.showModal();
  if (mode.value !== 'pdf' && mode.value !== 'image') void loadText();
});

watch(mode, (value, previous) => {
  // L'image n'a pas pu s'afficher (format non géré) : on bascule sur le texte extrait.
  if (value === 'extracted' && previous === 'image') void loadText();
});

onMounted(() => {
  heicSupported.value = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
});
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto h-[min(88dvh,1100px)] max-h-none w-[min(960px,calc(100%_-_32px))] max-w-none overflow-hidden rounded-xl border bg-surface p-0 text-text backdrop:bg-night/60 open:flex open:flex-col max-[640px]:h-dvh max-[640px]:w-full max-[640px]:rounded-none max-[640px]:border-0"
    aria-labelledby="preview-title"
    @close="emit('close')"
    @click.self="dialog?.close()"
  >
    <template v-if="file">
      <header class="flex items-center gap-2.5 border-b px-3.5 py-3 max-[640px]:pt-[max(12px,env(safe-area-inset-top))]">
        <FileTypeIcon :mime-type="file.mimeType" :size="36" />
        <div class="min-w-0 flex-1">
          <h2 id="preview-title" class="truncate text-[15px]">{{ file.name }}</h2>
          <p class="text-2xs text-muted">{{ formatBytes(file.sizeBytes) }}{{ file.analysis ? ` · ${file.analysis.documentType}` : '' }}</p>
        </div>
        <a class="icon-btn" :href="`${contentUrl}?download=1`" :aria-label="`Télécharger ${file.name}`" download><AppIcon name="arrow-up-from-bracket" :size="14" /></a>
        <a v-if="mode === 'pdf' || mode === 'image'" class="icon-btn" :href="contentUrl" target="_blank" rel="noopener" aria-label="Ouvrir dans un nouvel onglet"><AppIcon name="external-link" :size="14" /></a>
        <button class="icon-btn" type="button" aria-label="Fermer l'aperçu" @click="dialog?.close()"><AppIcon name="xmark" :size="14" /></button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto" :class="mode === 'pdf' || mode === 'image' ? 'bg-surface-muted p-0' : 'p-4'">
        <iframe v-if="mode === 'pdf'" class="w-full flex-1 border-0" :src="contentUrl" :title="`Aperçu de ${file.name}`" />
        <img v-else-if="mode === 'image'" class="size-full object-contain" :src="contentUrl" :alt="file.analysis?.summary ?? file.name" @error="imageFailed = true">
        <template v-else>
          <p v-if="mode === 'extracted'" class="alert alert-info">
            <AppIcon name="microchip" :size="14" />
            {{ file.mimeType.startsWith('image/') ? 'Ce navigateur n’affiche pas ce format : voici la transcription faite par votre agent.' : 'Aperçu du texte extrait par votre agent. Téléchargez le fichier pour la mise en page d’origine.' }}
          </p>
          <p v-if="loading && text === null" class="text-xs text-muted"><span class="spinner" /> Chargement…</p>
          <p v-else-if="error" class="alert alert-error">{{ error }}</p>
          <p v-else-if="text === ''" class="empty-state text-xs">Aucun texte disponible{{ file.status !== 'ready' ? ' : le document n’est pas encore analysé.' : '.' }}</p>
          <!-- eslint-disable-next-line vue/no-v-html -- Markdown échappé par renderMarkdown -->
          <article v-else-if="mode === 'markdown'" class="prose m-0 rounded-md bg-surface-muted p-4 text-[13px] leading-[21px] [word-break:break-word] whitespace-pre-wrap" v-html="html" />
          <pre v-else-if="text !== null" class="m-0 rounded-md bg-surface-muted p-4 [font-family:inherit] text-[13px] leading-[21px] [word-break:break-word] whitespace-pre-wrap">{{ text }}</pre>
          <button v-if="mode === 'extracted' && text !== null && text.length < totalLength" class="btn btn-block" type="button" :disabled="loading" @click="loadText(true)">
            Afficher la suite ({{ Math.round((text.length / totalLength) * 100) }} %)
          </button>
        </template>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
/* Markdown injecté via v-html : marges et puces d'origine rétablies après le preflight de Tailwind. */
.prose :deep(p) {
  margin: 0 0 8px;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 1em 0;
  padding-left: 40px;
  list-style: disc;
}

.prose :deep(ol) {
  list-style: decimal;
}
</style>
