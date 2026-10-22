<script setup lang="ts">
const { signOut } = useAuth();
const { verify, supported } = useStepUp();
const locked = useAppLock();
const busy = ref(false);
const error = ref<string | null>(null);

async function unlock() {
  busy.value = true;
  error.value = null;
  try {
    await verify();
    locked.unlock();
  } catch (caught) {
    error.value = caught instanceof Error && caught.name === 'NotAllowedError' ? 'Vérification annulée.' : getErrorMessage(caught, 'Déverrouillage impossible.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="locked.isLocked.value" class="lock" role="dialog" aria-modal="true" aria-labelledby="lock-title">
    <BrandLogo :size="64" :online="false" />
    <h1 id="lock-title">DashIA est verrouillé</h1>
    <p class="muted small">Vos documents et discussions restent masqués tant que vous n'avez pas déverrouillé l'app.</p>
    <button v-if="supported" class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="busy" @click="unlock">
      <AppIcon name="face-smile" :size="18" />Déverrouiller avec Face ID
    </button>
    <p v-if="error" class="alert alert-error">{{ error }}</p>
    <button class="btn btn-ghost" type="button" @click="signOut">Utiliser le mot de passe</button>
  </div>
</template>

<style scoped>
.lock {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(16px);
  text-align: center;
}

.lock h1 {
  font-size: 22px;
  line-height: 28px;
}

.lock .btn-block {
  max-width: 360px;
}
</style>
