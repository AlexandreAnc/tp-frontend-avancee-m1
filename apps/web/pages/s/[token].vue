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
  <main class="flex min-h-dvh items-center justify-center bg-bg p-4">
    <div class="card flex w-[min(420px,100%)] flex-col items-center gap-3.5 rounded-xl px-6 py-7 text-center">
      <BrandLogo :size="48" :online="false" />
      <template v-if="file">
        <FileTypeIcon :mime-type="file.mimeType" :size="48" />
        <h1 class="max-w-full truncate text-[18px]">{{ file.name }}</h1>
        <p class="text-xs text-muted">{{ formatBytes(file.sizeBytes) }} · lien valable jusqu’au {{ formatDayLong(file.expiresAt) }} à {{ formatTime(file.expiresAt) }}</p>
        <a class="btn btn-ink btn-lg btn-block" :href="`/api/share/${encodeURIComponent(token)}/download`" download>
          <AppIcon name="arrow-up-from-bracket" :size="14" />Télécharger
        </a>
        <p class="text-2xs text-muted">Partagé depuis DashIA. Ce lien ne donne accès qu’à ce fichier.</p>
      </template>
      <template v-else-if="error">
        <span class="icon-tile tone-danger"><AppIcon name="ban" :size="16" /></span>
        <h1 class="max-w-full text-[18px]">Lien indisponible</h1>
        <p class="text-xs text-muted">Ce lien a expiré, a été révoqué, ou n’existe pas. Demandez un nouveau lien à la personne qui vous l’a envoyé.</p>
      </template>
    </div>
  </main>
</template>
