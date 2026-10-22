<script setup lang="ts">
const route = useRoute();
const { signOut } = useAuth();
const { verify, supported } = useStepUp();
const locked = useAppLock();
const busy = ref(false);
const error = ref<string | null>(null);
const pin = ref('');
/** Sans Face ID sur cet appareil, le code de secours est proposé d'emblée. */
const usePin = ref(false);
const pinInput = ref<HTMLInputElement | null>(null);

/** Les liens de partage s'ouvrent sans compte : jamais verrouillés. */
const visible = computed(() => locked.isLocked.value && !route.path.startsWith('/s/'));
const showPin = computed(() => locked.hasPin.value && (usePin.value || !supported));

watch(showPin, (value) => {
  if (value) void nextTick(() => pinInput.value?.focus());
});

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

async function unlockWithPin() {
  if (pin.value.length !== 6) return;
  busy.value = true;
  error.value = null;
  try {
    await $fetch('/api/me/pin/verify', { method: 'POST', body: { pin: pin.value } });
    pin.value = '';
    usePin.value = false;
    locked.unlock();
  } catch (caught) {
    error.value = getErrorMessage(caught, 'Déverrouillage impossible.');
    pin.value = '';
  } finally {
    busy.value = false;
  }
  // Le champ était désactivé pendant la vérification : on lui rend le focus une fois réactivé.
  await nextTick();
  pinInput.value?.focus();
}

function onPinInput(event: Event) {
  pin.value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
  if (pin.value.length === 6) void unlockWithPin();
}
</script>

<template>
  <div v-if="visible" class="lock" role="dialog" aria-modal="true" aria-labelledby="lock-title">
    <BrandLogo :size="64" :online="false" />
    <h1 id="lock-title">DashIA est verrouillé</h1>
    <p class="muted small">Vos documents et discussions restent masqués tant que vous n'avez pas déverrouillé l'app.</p>

    <form v-if="showPin" class="pin" @submit.prevent="unlockWithPin">
      <label class="field-label" for="unlock-pin">Code de secours</label>
      <input
        id="unlock-pin"
        ref="pinInput"
        class="input pin-input"
        :value="pin"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        :disabled="busy"
        aria-describedby="pin-help"
        @input="onPinInput"
      >
      <span class="pin-dots" aria-hidden="true"><i v-for="index in 6" :key="index" :class="{ on: index <= pin.length }" /></span>
      <span id="pin-help" class="tiny muted">6 chiffres</span>
    </form>
    <button v-else-if="supported" class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="busy" @click="unlock">
      <AppIcon name="face-smile" :size="18" />Déverrouiller avec Face ID
    </button>

    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <button v-if="locked.hasPin.value && supported" class="btn btn-ghost" type="button" @click="usePin = !usePin; error = null">
      {{ usePin ? 'Utiliser Face ID' : 'Utiliser le code de secours' }}
    </button>
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

.pin {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* Le champ reste réel (clavier numérique, gestionnaires de mots de passe) mais invisible : on affiche des points. */
.pin-input {
  position: absolute;
  inset: 24px 0 auto;
  height: 40px;
  opacity: 0;
}

.pin-dots {
  display: flex;
  gap: 14px;
  padding: 10px 0;
}

.pin-dots i {
  width: 14px;
  height: 14px;
  border: 2px solid var(--ink);
  border-radius: 50%;
}

.pin-dots i.on {
  background: var(--ink);
}
</style>
