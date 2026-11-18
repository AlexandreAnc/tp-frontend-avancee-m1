<script setup lang="ts">
/**
 * Une nouvelle version du service worker attend : on propose de recharger au lieu de le faire d'office,
 * pour ne jamais couper une saisie ou un dépôt en cours. « Plus tard » : elle s'appliquera à la prochaine ouverture.
 */
const { $pwa } = useNuxtApp();
const reloading = ref(false);

async function reload() {
  reloading.value = true;
  // Active la version en attente (message SKIP_WAITING) puis recharge la page quand elle prend la main.
  await $pwa?.updateServiceWorker(true);
}
</script>

<template>
  <div
    v-if="$pwa?.needRefresh"
    class="fixed inset-x-4 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+12px)] z-30 mx-auto flex max-w-[420px] items-center gap-3 rounded-lg bg-ink py-2.5 pr-2 pl-4 text-on-ink shadow-popover lg:bottom-6"
    role="status"
  >
    <AppIcon name="rotate-right" :size="14" />
    <span class="min-w-0 flex-1 text-xs font-bold">Nouvelle version disponible</span>
    <button class="btn btn-sm" type="button" :disabled="reloading" @click="reload">Recharger</button>
    <button class="icon-btn border-transparent bg-transparent text-on-ink" type="button" aria-label="Plus tard" @click="$pwa.cancelPrompt()"><AppIcon name="xmark" /></button>
  </div>
</template>
