<script setup lang="ts">
/** Entrée « Installer l'application » : invite du navigateur si elle existe, sinon la marche à suivre (iPhone : Partager). */
const { $pwa } = useNuxtApp();
const standalone = ref(false);
const installing = ref(false);

onMounted(() => {
  const query = window.matchMedia('(display-mode: standalone)');
  const update = () => (standalone.value = query.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  update();
  query.addEventListener('change', update);
});

const mode = computed(() => installMode({
  standalone: standalone.value || Boolean($pwa?.isPWAInstalled),
  promptAvailable: Boolean($pwa?.showInstallPrompt),
  userAgent: import.meta.client ? navigator.userAgent : '',
  maxTouchPoints: import.meta.client ? navigator.maxTouchPoints : 0,
}));

const SUBTITLES: Record<Exclude<InstallMode, 'installed'>, string> = {
  prompt: 'Accès direct depuis l’écran d’accueil, même hors ligne',
  ios: 'Touchez Partager, puis « Sur l’écran d’accueil »',
  manual: 'Menu du navigateur, puis « Installer DashIA » ou « Ajouter à l’écran d’accueil »',
};

async function install() {
  installing.value = true;
  try {
    await $pwa?.install();
  } finally {
    installing.value = false;
  }
}
</script>

<template>
  <SettingsRow v-if="mode !== 'installed'" icon="mobile" tone="tone-primary" title="Installer l’application" :subtitle="SUBTITLES[mode]">
    <button v-if="mode === 'prompt'" class="btn btn-sm btn-ink" type="button" :disabled="installing" @click="install">Installer</button>
  </SettingsRow>
</template>
