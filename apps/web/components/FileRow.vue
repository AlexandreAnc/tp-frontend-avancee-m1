<script setup lang="ts">
import type { FileAnalysis, FileCategory, FileStatus } from '@app/shared';

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  analysis: FileAnalysis | null;
  category: FileCategory | null;
  error: string | null;
  createdAt: string;
  folderId?: string | null;
  starred?: boolean;
  /** Chemin du dossier (« Logement / 2026 »), renvoyé par `/api/drive`. */
  path?: string;
}

const props = defineProps<{ file: FileItem; selected?: boolean }>();
const emit = defineEmits<{ select: [id: string]; preview: [id: string]; delete: [id: string]; reindex: [id: string] }>();

/** Puces affichées sous un fichier analysé : premier montant, prochaine échéance, catégorie. */
const chips = computed(() => {
  const info = props.file.analysis?.keyInfo;
  if (!info) return [];
  const amount = info.amounts[0];
  const deadline = info.dates.find((date) => date.isDeadline && date.iso);
  return [
    amount && { label: amount.value, tone: '' },
    deadline?.iso && { label: `Échéance ${formatShortDate(deadline.iso)}`, tone: 'deadline' },
    props.file.category && { label: props.file.category, tone: '' },
  ].filter(Boolean) as { label: string; tone: string }[];
});
</script>

<template>
  <article
    class="flex cursor-pointer flex-col gap-3 rounded-lg border bg-surface p-[15px]"
    :class="selected
      ? 'border-ink ring-1 ring-ink'
      : file.status === 'processing'
        ? 'border-[color-mix(in_srgb,var(--color-info)_25%,var(--color-border))]'
        : file.status === 'failed' && 'border-[color-mix(in_srgb,var(--color-danger)_20%,var(--color-border))]'"
    @click="emit('select', file.id)"
  >
    <div class="flex items-center gap-3">
      <FileTypeIcon :mime-type="file.mimeType" />
      <div class="flex min-w-0 flex-1 flex-col">
        <strong class="font-extrabold [word-break:break-word]">{{ file.name }}</strong>
        <span class="text-xs" :class="file.status === 'failed' ? 'font-semibold text-danger' : 'text-muted'">{{ fileSubtitle(file) }}</span>
      </div>
      <!-- Rangée compacte du drive (≤ 480 px) : aperçu et statut « Analysé » sont dans le menu et le détail, le nom garde la place. -->
      <FileStatusBadge :status="file.status" class="max-[480px]:[&.tone-primary]:hidden" />
      <button class="icon-btn size-8 max-[480px]:hidden" type="button" :aria-label="`Aperçu de ${file.name}`" @click.stop="emit('preview', file.id)"><AppIcon name="eye" :size="14" /></button>
      <slot name="actions" />
    </div>

    <div v-if="file.status === 'processing'" class="h-1.5 overflow-hidden rounded-full bg-info-soft" aria-hidden="true"><span class="indeterminate block h-full w-2/5 rounded-[inherit] bg-info" /></div>
    <div v-if="chips.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="chip in chips"
        :key="chip.label"
        class="rounded-tag px-2 pt-[3px] pb-[4.5px] text-[12px] leading-[17px] font-bold"
        :class="chip.tone === 'deadline' ? 'bg-danger-soft text-danger' : 'bg-surface-muted'"
      >{{ chip.label }}</span>
    </div>
    <div v-if="file.status === 'failed'" class="grid grid-cols-[1fr_1fr] gap-2" @click.stop>
      <button class="btn btn-sm min-h-9" type="button" @click="emit('delete', file.id)">Corbeille</button>
      <button class="btn btn-sm btn-danger min-h-9" type="button" @click="emit('reindex', file.id)"><AppIcon name="rotate-right" :size="12" />Réessayer</button>
    </div>
  </article>
</template>

<style scoped>
/* Barre de progression indéterminée : keyframes, non exprimables en utilitaires. */
.indeterminate {
  animation: indeterminate 1.4s ease-in-out infinite;
}

@keyframes indeterminate {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(250%);
  }
}
</style>
