<script setup lang="ts">
import { SHARE_LINK_DURATIONS_HOURS, type ShareLinkDuration } from '@app/shared';
import type { FileItem } from '~/components/FileRow.vue';

interface ShareLink {
  id: string;
  expiresAt: string;
  downloadCount: number;
  lastDownloadAt: string | null;
  createdAt: string;
}

const dialog = ref<HTMLDialogElement | null>(null);
const file = ref<FileItem | null>(null);
const links = ref<ShareLink[]>([]);
const hours = ref<ShareLinkDuration>(24);
/** URL du lien tout juste créé : le jeton n'est connu qu'à ce moment-là. */
const createdUrl = ref<string | null>(null);
const copied = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

const DURATION_LABELS: Record<ShareLinkDuration, string> = { 1: '1 heure', 24: '24 heures', 168: '7 jours' };

async function load() {
  if (!file.value) return;
  links.value = (await $fetch<{ links: ShareLink[] }>(`/api/files/${file.value.id}/shares`)).links;
}

async function open(target: FileItem) {
  file.value = target;
  createdUrl.value = null;
  error.value = null;
  links.value = [];
  dialog.value?.showModal();
  await load().catch((caught: unknown) => (error.value = getErrorMessage(caught)));
}

async function create() {
  if (!file.value) return;
  busy.value = true;
  error.value = null;
  try {
    const { token } = await $fetch<{ token: string }>(`/api/files/${file.value.id}/shares`, { method: 'POST', body: { hours: hours.value } });
    createdUrl.value = `${window.location.origin}/s/${token}`;
    await load();
    await copy();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function copy() {
  if (!createdUrl.value) return;
  try {
    await navigator.clipboard.writeText(createdUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Presse-papiers refusé : l'adresse reste affichée, sélectionnable.
  }
}

async function shareNative() {
  if (!createdUrl.value || !file.value) return;
  await navigator.share({ title: file.value.name, url: createdUrl.value }).catch(() => undefined);
}

async function revoke(link: ShareLink) {
  await $fetch(`/api/shares/${link.id}`, { method: 'DELETE' });
  await load();
}

const canShareNative = computed(() => import.meta.client && 'share' in navigator);
const remaining = (iso: string) => {
  const hoursLeft = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000));
  return hoursLeft >= 48 ? `${Math.round(hoursLeft / 24)} jours` : hoursLeft >= 1 ? `${hoursLeft} h` : 'moins d’une heure';
};

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="share" aria-labelledby="share-title" @click.self="dialog?.close()">
    <div v-if="file" class="stack">
      <header class="row">
        <FileTypeIcon :mime-type="file.mimeType" :size="32" />
        <div class="grow">
          <h2 id="share-title">Partager par lien</h2>
          <p class="tiny muted ellipsis">{{ file.name }}</p>
        </div>
        <button class="icon-btn" type="button" aria-label="Fermer" @click="dialog?.close()"><AppIcon name="xmark" :size="12" /></button>
      </header>

      <p class="small muted">
        Toute personne ayant le lien peut télécharger ce fichier, sans compte, jusqu’à son expiration. Le reste de votre drive n’est jamais visible.
      </p>

      <template v-if="createdUrl">
        <code class="url">{{ createdUrl }}</code>
        <div class="buttons">
          <button class="btn btn-ink" type="button" @click="copy"><AppIcon name="file-export" :size="12" />{{ copied ? 'Copié ✓' : 'Copier le lien' }}</button>
          <button v-if="canShareNative" class="btn" type="button" @click="shareNative"><AppIcon name="paper-plane" :size="12" />Envoyer…</button>
          <button v-else class="btn" type="button" @click="createdUrl = null">Nouveau lien</button>
        </div>
      </template>
      <template v-else>
        <div class="segmented" role="radiogroup" aria-label="Durée de validité">
          <button
            v-for="duration in SHARE_LINK_DURATIONS_HOURS"
            :key="duration"
            type="button"
            role="radio"
            :aria-checked="hours === duration"
            :class="{ active: hours === duration }"
            @click="hours = duration"
          >
            {{ DURATION_LABELS[duration] }}
          </button>
        </div>
        <button class="btn btn-ink btn-block" type="button" :disabled="busy" @click="create">
          <span v-if="busy" class="spinner" />Créer le lien ({{ DURATION_LABELS[hours] }})
        </button>
      </template>

      <p v-if="error" class="alert alert-error">{{ error }}</p>

      <section v-if="links.length" class="stack">
        <h3 class="section-label">Liens actifs</h3>
        <div class="card card-flush">
          <div v-for="link in links" :key="link.id" class="link-row">
            <span class="grow small">
              <strong>Expire dans {{ remaining(link.expiresAt) }}</strong>
              <span class="tiny muted">{{ link.downloadCount }} téléchargement{{ link.downloadCount > 1 ? 's' : '' }}</span>
            </span>
            <button class="btn btn-sm" type="button" @click="revoke(link)">Révoquer</button>
          </div>
        </div>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
.share {
  width: min(460px, calc(100% - 24px));
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
}

.share::backdrop {
  background: rgb(28 31 35 / 0.45);
}

.share h2 {
  font-size: 16px;
}

.share .grow {
  min-width: 0;
}

.url {
  display: block;
  padding: 12px;
  word-break: break-all;
  user-select: all;
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.link-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}

.link-row + .link-row {
  border-top: 1px solid var(--border);
}

.link-row .grow {
  display: flex;
  flex-direction: column;
}
</style>
