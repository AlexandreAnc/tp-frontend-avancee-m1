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
  await navigateTo(redirectTarget());
}

watch(mode, () => (error.value = null));

function redirectTarget() {
  const target = route.query.redirect;
  return typeof target === 'string' && target.startsWith('/') ? target : '/';
}

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
  await navigateTo(mode.value === 'register' ? '/bienvenue' : redirectTarget());
}
</script>

<template>
  <section class="hero">
    <BrandLogo />
    <h1 class="title">DashIA</h1>
    <p class="muted tagline">Votre assistant I.A local — planning, documents et maison, au même endroit.</p>
  </section>

  <div class="segmented" role="tablist" aria-label="Connexion ou inscription">
    <button type="button" role="tab" :aria-selected="mode === 'login'" :class="{ active: mode === 'login' }" @click="mode = 'login'">Connexion</button>
    <button type="button" role="tab" :aria-selected="mode === 'register'" :class="{ active: mode === 'register' }" @click="mode = 'register'">Inscription</button>
  </div>

  <form class="form" @submit.prevent="submit">
    <template v-if="mode === 'login' && passkeySupported">
      <button class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="loading" @click="signInWithPasskey">
        <AppIcon name="face-smile" :size="18" />Se connecter avec Face ID
      </button>
      <div class="divider"><span>ou avec votre e-mail</span></div>
    </template>
    <p v-if="error" class="alert alert-error" role="alert"><AppIcon name="circle-exclamation" :size="14" />{{ error }}</p>

    <label v-if="mode === 'register'" class="field">
      <span class="field-label">Nom</span>
      <span class="input-group">
        <AppIcon name="face-smile" :size="16" />
        <input v-model="name" autocomplete="name" required placeholder="Julien Morel">
      </span>
    </label>

    <label class="field">
      <span class="field-label">E-mail</span>
      <span class="input-group">
        <AppIcon name="envelope" :size="16" />
        <input v-model="email" type="email" autocomplete="email" required placeholder="vous@exemple.fr">
      </span>
    </label>

    <label class="field">
      <span class="field-label">Mot de passe</span>
      <span class="input-group">
        <AppIcon name="lock" :size="16" />
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          :minlength="mode === 'register' ? MIN_PASSWORD_LENGTH : undefined"
          required
        >
        <button type="button" class="reveal" :aria-label="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'" :aria-pressed="showPassword" @click="showPassword = !showPassword">
          <AppIcon name="eye" :size="16" />
        </button>
      </span>
      <span v-if="mode === 'register'" class="tiny muted">{{ MIN_PASSWORD_LENGTH }} caractères minimum</span>
    </label>

    <button class="btn btn-ink btn-lg btn-block" type="submit" :disabled="loading">
      <span v-if="loading" class="spinner" />
      {{ mode === 'login' ? 'Se connecter' : 'Créer mon compte' }}
    </button>
  </form>

  <footer class="privacy">
    <span class="icon-tile tone-primary"><AppIcon name="shield" /></span>
    <p class="small">
      <strong>Vos documents sont analysés chez vous.</strong>
      <span class="muted"> L'agent I.A tourne sur votre PC : aucun service d'I.A tiers ne reçoit vos données.</span>
    </p>
  </footer>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 64px;
  text-align: center;
}

.title {
  margin-top: 20px;
  font-size: 28px;
  line-height: 42px;
  letter-spacing: -0.7px;
}

.tagline {
  max-width: 260px;
  margin-top: 4px;
}

.segmented {
  margin-top: 32px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 24px 0 32px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.reveal {
  display: inline-flex;
  border: none;
  background: none;
  padding: 4px;
  color: var(--text-muted);
  cursor: pointer;
}

.privacy {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: auto;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  line-height: 19.5px;
}

.privacy .icon-tile {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
}
</style>
