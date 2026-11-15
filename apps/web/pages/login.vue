<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Connexion · DashIA' });

const MIN_PASSWORD_LENGTH = 10;
const route = useRoute();
const mode = ref<'login' | 'register'>(route.query.mode === 'register' ? 'register' : 'login');
const name = ref('');
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref<string | null>(null);
const loading = ref(false);
const { supported: passkeySupported } = useStepUp();

async function signInWithPasskey() {
  error.value = null;
  loading.value = true;
  const result = await authClient.signIn.passkey();
  loading.value = false;
  if (result?.error) {
    error.value = /cancel|annul|NotAllowed/i.test(result.error.message ?? '')
      ? 'Connexion annulée.'
      : 'Aucune passkey reconnue sur cet appareil. Connectez-vous avec votre e-mail puis ajoutez Face ID dans les réglages.';
    return;
  }
  await navigateTo(safeRedirect(route.query.redirect));
}

watch(mode, () => (error.value = null));

async function submit() {
  error.value = null;
  if (mode.value === 'register' && password.value.length < MIN_PASSWORD_LENGTH) {
    error.value = `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    return;
  }
  loading.value = true;
  const { error: failure } = mode.value === 'login'
    ? await authClient.signIn.email({ email: email.value, password: password.value })
    : await authClient.signUp.email({ name: name.value, email: email.value, password: password.value });
  loading.value = false;

  if (failure) {
    if (failure.status === 429) error.value = 'Trop de tentatives. Réessayez dans un instant.';
    else if (mode.value === 'login') error.value = failure.status === 401 ? 'E-mail ou mot de passe incorrect.' : failure.message ?? 'Connexion impossible.';
    else error.value = failure.code === 'USER_ALREADY_EXISTS' ? 'Un compte existe déjà avec cet e-mail.' : failure.message ?? 'Inscription impossible.';
    return;
  }
  await navigateTo(mode.value === 'register' ? '/bienvenue' : safeRedirect(route.query.redirect));
}
</script>

<template>
  <section class="flex flex-col items-center pt-16 text-center">
    <BrandLogo />
    <h1 class="mt-5 text-[28px] leading-[42px] tracking-[-0.7px]">DashIA</h1>
    <p class="mt-1 max-w-[260px] text-muted">Votre assistant I.A local — planning, documents et maison, au même endroit.</p>
  </section>

  <div class="segmented mt-8" role="tablist" aria-label="Connexion ou inscription">
    <button type="button" role="tab" :aria-selected="mode === 'login'" :class="{ active: mode === 'login' }" @click="mode = 'login'">Connexion</button>
    <button type="button" role="tab" :aria-selected="mode === 'register'" :class="{ active: mode === 'register' }" @click="mode = 'register'">Inscription</button>
  </div>

  <form class="mt-6 mb-8 flex flex-col gap-4" @submit.prevent="submit">
    <template v-if="mode === 'login' && passkeySupported">
      <button class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="loading" @click="signInWithPasskey">
        <AppIcon name="face-smile" :size="18" />Se connecter avec Face ID
      </button>
      <div class="flex items-center gap-3 text-xs leading-5 text-muted before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"><span>ou avec votre e-mail</span></div>
    </template>
    <p v-if="error" class="alert alert-error" role="alert"><AppIcon name="circle-exclamation" :size="14" />{{ error }}</p>

    <label v-if="mode === 'register'" class="field">
      <span class="field-label">Nom</span>
      <span class="input-group">
        <AppIcon name="face-smile" :size="16" />
        <input v-model="name" class="px-0.5 py-px" autocomplete="name" required placeholder="Julien Morel">
      </span>
    </label>

    <label class="field">
      <span class="field-label">E-mail</span>
      <span class="input-group">
        <AppIcon name="envelope" :size="16" />
        <input v-model="email" class="px-0.5 py-px" type="email" autocomplete="email" required placeholder="vous@exemple.fr">
      </span>
    </label>

    <label class="field">
      <span class="field-label">Mot de passe</span>
      <span class="input-group">
        <AppIcon name="lock" :size="16" />
        <input
          v-model="password"
          class="px-0.5 py-px"
          :type="showPassword ? 'text' : 'password'"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          :minlength="mode === 'register' ? MIN_PASSWORD_LENGTH : undefined"
          required
        >
        <button
          type="button"
          class="inline-flex cursor-pointer p-1 text-muted"
          :aria-label="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
          :aria-pressed="showPassword"
          @click="showPassword = !showPassword"
        >
          <AppIcon name="eye" :size="16" />
        </button>
      </span>
      <span v-if="mode === 'register'" class="text-2xs text-muted">{{ MIN_PASSWORD_LENGTH }} caractères minimum</span>
    </label>

    <button class="btn btn-ink btn-lg btn-block" type="submit" :disabled="loading">
      <span v-if="loading" class="spinner" />
      {{ mode === 'login' ? 'Se connecter' : 'Créer mon compte' }}
    </button>
  </form>

  <footer class="mt-auto flex items-start gap-3 rounded-md border bg-surface/70 p-[15px] leading-[19.5px]">
    <span class="icon-tile tone-primary size-8 rounded-sm"><AppIcon name="shield" /></span>
    <p class="text-xs">
      <strong>Vos documents sont analysés chez vous.</strong>
      <span class="text-muted"> L'agent I.A tourne sur votre PC : aucun service d'I.A tiers ne reçoit vos données.</span>
    </p>
  </footer>
</template>
