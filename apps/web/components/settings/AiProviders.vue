<script setup lang="ts">
import { EXTERNAL_AI_PROVIDERS, type AiProvider, type ExternalAiProvider } from '@app/shared';

const { data, refresh } = await useFetch('/api/ai', { key: 'ai-settings' });
const { ask } = useConfirm();
const keyDialog = ref<{ open: (provider: ExternalAiProvider) => void } | null>(null);
const models = ref<Partial<Record<ExternalAiProvider, string[]>>>({});
const busy = ref<string | null>(null);
const error = ref<string | null>(null);

const current = computed(() => data.value?.ai.provider ?? 'dashia');
const providers = computed(() => data.value?.ai.providers ?? []);

async function run(key: string, task: () => Promise<unknown>) {
  busy.value = key;
  error.value = null;
  try {
    await task();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = null;
  }
}

/** Modèles disponibles avec la clé, chargés à la demande (un appel au fournisseur). */
async function loadModels(provider: ExternalAiProvider) {
  if (models.value[provider]) return;
  await run(`models-${provider}`, async () => {
    // Typage explicite : l'URL dynamique fait exploser l'inférence des routes Nitro (TS2321).
    const { models: list } = await $fetch<unknown>(`/api/ai/keys/${provider}/models`) as { models: string[] };
    models.value = { ...models.value, [provider]: list };
  });
}

function choose(provider: AiProvider) {
  return run(`use-${provider}`, async () => {
    data.value = await $fetch<unknown>('/api/ai', { method: 'PATCH', body: { provider } }) as typeof data.value;
  });
}

function changeModel(provider: ExternalAiProvider, model: string) {
  return run(`model-${provider}`, async () => {
    data.value = await $fetch<unknown>(`/api/ai/keys/${provider}`, { method: 'PATCH', body: { model } }) as typeof data.value;
  });
}

async function removeKey(provider: ExternalAiProvider) {
  const label = EXTERNAL_AI_PROVIDERS[provider].label;
  if (!await ask({ title: `Retirer la clé ${label} ?`, message: current.value === provider ? 'Vos conversations repasseront sur l’IA DashIA.' : 'Vous pourrez en ajouter une autre à tout moment.', confirm: 'Retirer', danger: true })) return;
  await run(`remove-${provider}`, async () => {
    data.value = await $fetch<unknown>(`/api/ai/keys/${provider}`, { method: 'DELETE' }) as typeof data.value;
    models.value = { ...models.value, [provider]: undefined };
  });
}

async function onKeySaved() {
  await refresh();
}
</script>

<template>
  <SettingsGroup title="Intelligence artificielle">
    <SettingsRow icon="microchip" tone="tone-ink" title="DashIA" subtitle="IA du service, hébergée par DashIA : vos données ne partent chez aucun tiers">
      <span v-if="current === 'dashia'" class="badge tone-primary">Utilisée</span>
      <button v-else class="btn btn-sm" type="button" :disabled="busy !== null" @click="choose('dashia')">Utiliser</button>
    </SettingsRow>

    <SettingsRow
      v-for="entry in providers"
      :key="entry.provider"
      icon="key"
      :tone="current === entry.provider ? 'tone-primary' : ''"
      :title="EXTERNAL_AI_PROVIDERS[entry.provider].label"
    >
      <template #subtitle>
        <template v-if="entry.keyHint">
          Clé •••• {{ entry.keyHint }} ·
          <select
            class="max-w-[190px] rounded-xs border bg-surface px-1 py-px text-2xs font-bold text-text"
            :value="entry.model ?? ''"
            :disabled="busy !== null"
            :aria-label="`Modèle ${EXTERNAL_AI_PROVIDERS[entry.provider].label}`"
            @focus="loadModels(entry.provider)"
            @pointerdown="loadModels(entry.provider)"
            @change="changeModel(entry.provider, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="model in models[entry.provider] ?? [entry.model]" :key="model ?? ''" :value="model">{{ model }}</option>
          </select>
        </template>
        <template v-else>Votre propre clé d'API, facturée sur votre compte</template>
      </template>
      <template v-if="entry.keyHint">
        <span v-if="current === entry.provider" class="badge tone-primary">Utilisée</span>
        <button v-else class="btn btn-sm" type="button" :disabled="busy !== null" @click="choose(entry.provider)">Utiliser</button>
        <button class="icon-btn size-8" type="button" :aria-label="`Retirer la clé ${EXTERNAL_AI_PROVIDERS[entry.provider].label}`" :disabled="busy !== null" @click="removeKey(entry.provider)">
          <AppIcon name="trash" :size="12" />
        </button>
      </template>
      <button v-else class="btn btn-sm" type="button" @click="keyDialog?.open(entry.provider)">Ajouter une clé</button>
    </SettingsRow>

    <div class="flex items-start gap-2 px-4 py-3 text-2xs text-muted">
      <AppIcon name="shield" :size="12" class="mt-0.5 shrink-0" />
      <span>
        Avec un fournisseur externe, vos messages et les extraits de documents utiles à la réponse lui sont envoyés.
        L'analyse et la recherche dans vos documents restent toujours sur DashIA.
      </span>
    </div>
    <p v-if="error" class="alert alert-error m-3">{{ error }}</p>
  </SettingsGroup>
  <SettingsApiKeyDialog ref="keyDialog" @saved="onKeySaved" />
</template>
