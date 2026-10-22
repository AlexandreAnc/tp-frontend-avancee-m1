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
  <article class="file" :class="[file.status, { selected }]" @click="emit('select', file.id)">
    <div class="main">
      <FileTypeIcon :mime-type="file.mimeType" />
      <div class="grow">
        <strong class="name">{{ file.name }}</strong>
        <span class="small sub" :class="{ error: file.status === 'failed' }">{{ fileSubtitle(file) }}</span>
      </div>
      <FileStatusBadge :status="file.status" />
      <button class="icon-btn eye" type="button" :aria-label="`Aperçu de ${file.name}`" @click.stop="emit('preview', file.id)"><AppIcon name="eye" :size="14" /></button>
      <slot name="actions" />
    </div>

    <div v-if="file.status === 'processing'" class="progress" aria-hidden="true"><span /></div>
    <div v-if="chips.length" class="chips-row">
      <span v-for="chip in chips" :key="chip.label" class="tag" :class="chip.tone">{{ chip.label }}</span>
    </div>
    <div v-if="file.status === 'failed'" class="buttons" @click.stop>
      <button class="btn btn-sm" type="button" @click="emit('delete', file.id)">Corbeille</button>
      <button class="btn btn-sm btn-danger" type="button" @click="emit('reindex', file.id)"><AppIcon name="rotate-right" :size="12" />Réessayer</button>
    </div>
  </article>
</template>

<style scoped>
.file {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  cursor: pointer;
}

.file.processing {
  border-color: color-mix(in srgb, var(--info) 25%, var(--border));
}

.file.failed {
  border-color: color-mix(in srgb, var(--danger) 20%, var(--border));
}

.file.selected {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink);
}

.main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.main .grow {
  display: flex;
  flex-direction: column;
}

.eye {
  width: 32px;
  height: 32px;
}

.name {
  font-weight: 800;
  word-break: break-word;
}

.sub {
  color: var(--text-muted);
}

.sub.error {
  color: var(--danger);
  font-weight: 600;
}

.progress {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--info-soft);
  overflow: hidden;
}

.progress span {
  display: block;
  width: 40%;
  height: 100%;
  border-radius: inherit;
  background: var(--info);
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

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 3px 8px 4.5px;
  border-radius: 6px;
  background: var(--surface-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 17px;
}

.tag.deadline {
  background: var(--danger-soft);
  color: var(--danger);
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.buttons .btn {
  min-height: 36px;
}
</style>
