<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';

definePageMeta({ layout: 'blank' });
useHead({ title: 'Fichier partagé · DashIA', meta: [{ name: 'robots', content: 'noindex' }, { name: 'referrer', content: 'no-referrer' }] });

/** Page publique d'un lien de partage : nom, taille, expiration, téléchargement. Aucune autre donnée. */
const route = useRoute();
const token = route.params.token as string;
const { data, error } = await useFetch<ApiResponse<'/api/share/:token', 'get'>>(`/api/share/${encodeURIComponent(token)}`, { key: `share-${token}` });
const file = computed(() => data.value?.file ?? null);
</script>

<template>
  <main class="shared">
    <div class="card box">
      <BrandLogo :size="48" :online="false" />
      <template v-if="file">
        <FileTypeIcon :mime-type="file.mimeType" :size="48" />
        <h1 class="ellipsis">{{ file.name }}</h1>
        <p class="small muted">{{ formatBytes(file.sizeBytes) }} · lien valable jusqu’au {{ formatDayLong(file.expiresAt) }} à {{ formatTime(file.expiresAt) }}</p>
        <a class="btn btn-ink btn-lg btn-block" :href="`/api/share/${encodeURIComponent(token)}/download`" download>
          <AppIcon name="arrow-up-from-bracket" :size="14" />Télécharger
        </a>
        <p class="tiny muted">Partagé depuis DashIA. Ce lien ne donne accès qu’à ce fichier.</p>
      </template>
      <template v-else-if="error">
        <span class="icon-tile tone-danger"><AppIcon name="ban" :size="16" /></span>
        <h1>Lien indisponible</h1>
        <p class="small muted">Ce lien a expiré, a été révoqué, ou n’existe pas. Demandez un nouveau lien à la personne qui vous l’a envoyé.</p>
      </template>
    </div>
  </main>
</template>

<style scoped>
.shared {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 16px;
  background: var(--bg);
}

.box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(420px, 100%);
  padding: 28px 24px;
  border-radius: var(--radius-xl);
  text-align: center;
}

.box h1 {
  max-width: 100%;
  font-size: 18px;
}
</style>
