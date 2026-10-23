<script setup lang="ts">
/**
 * Application Philips Hue de l'utilisateur : chacun peut brancher sa maison, même si le service
 * n'a pas d'application Philips configurée (le secret est chiffré et n'est jamais réaffiché).
 */
const { data, refresh } = await useFetch('/api/connectors/hue/app', { key: 'hue-app' });
const { ask } = useConfirm();
const clientId = ref('');
const clientSecret = ref('');
const saving = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);

const app = computed(() => data.value?.app);
const canConnect = computed(() => Boolean(app.value?.ownClientId || app.value?.serverApp));

async function save() {
  saving.value = true;
  error.value = null;
  try {
    data.value = await $fetch<unknown>('/api/connectors/hue/app', { method: 'PUT', body: { clientId: clientId.value, clientSecret: clientSecret.value } }) as typeof data.value;
    clientId.value = '';
    clientSecret.value = '';
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!await ask({ title: 'Retirer votre application Philips ?', message: 'La connexion à vos lampes sera coupée.', confirm: 'Retirer', danger: true })) return;
  data.value = await $fetch<unknown>('/api/connectors/hue/app', { method: 'DELETE' }) as typeof data.value;
  await refresh();
}

async function copyRedirect() {
  if (!app.value) return;
  await navigator.clipboard.writeText(app.value.redirectUri);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="flex w-full flex-col gap-3">
    <a v-if="canConnect" class="btn btn-primary btn-xl btn-block btn-shadow" href="/api/connectors/hue/connect">Connecter Philips Hue</a>

    <details class="rounded-lg border p-4 text-left" :open="!app?.serverApp && !app?.ownClientId">
      <summary class="cursor-pointer text-xs font-extrabold">
        {{ app?.ownClientId ? `Votre application Philips · ${app.ownClientId}` : app?.serverApp ? 'Utiliser ma propre application Philips (avancé)' : 'Configurer votre application Philips Hue' }}
      </summary>
      <div class="mt-3 flex flex-col gap-3 text-xs text-muted">
        <template v-if="app?.ownClientId">
          <p>DashIA utilise votre application pour se connecter à votre compte Philips Hue.</p>
          <button class="btn btn-sm self-start" type="button" @click="remove">Retirer cette application</button>
        </template>
        <form v-else class="flex flex-col gap-3" @submit.prevent="save">
          <ol class="flex list-decimal flex-col gap-1.5 pl-4">
            <li>Créez une application sur <a href="https://developers.meethue.com/my-apps/" target="_blank" rel="noopener noreferrer">developers.meethue.com</a> (compte Philips Hue gratuit).</li>
            <li>
              Indiquez cette URL de redirection :
              <span class="mt-1 flex items-start gap-2">
                <code class="min-w-0 flex-1 break-all">{{ app?.redirectUri }}</code>
                <button class="text-btn shrink-0" type="button" @click="copyRedirect">{{ copied ? 'Copiée' : 'Copier' }}</button>
              </span>
            </li>
            <li>Collez ici le Client ID et le Client Secret de l'application.</li>
          </ol>
          <label class="field">
            <span class="field-label">Client ID</span>
            <input v-model="clientId" class="input" autocomplete="off" spellcheck="false" required>
          </label>
          <label class="field">
            <span class="field-label">Client Secret</span>
            <input v-model="clientSecret" class="input" type="password" autocomplete="off" spellcheck="false" required>
          </label>
          <p v-if="error" class="alert alert-error">{{ error }}</p>
          <button class="btn btn-ink" type="submit" :disabled="saving || !clientId.trim() || !clientSecret.trim()">
            <span v-if="saving" class="spinner" />Enregistrer l'application
          </button>
        </form>
      </div>
    </details>
  </div>
</template>
