<script setup lang="ts">
import { EXTERNAL_AI_PROVIDERS, type ExternalAiProvider } from '@app/shared';

const emit = defineEmits<{ saved: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const provider = ref<ExternalAiProvider>('anthropic');
const apiKey = ref('');
const error = ref<string | null>(null);
const saving = ref(false);

const definition = computed(() => EXTERNAL_AI_PROVIDERS[provider.value]);

function open(target: ExternalAiProvider) {
  provider.value = target;
  apiKey.value = '';
  error.value = null;
  dialog.value?.showModal();
  void nextTick(() => input.value?.focus());
}

/** La clé est vérifiée auprès du fournisseur avant d'être enregistrée (chiffrée) ; elle n'est plus jamais affichée. */
async function submit() {
  if (!apiKey.value.trim() || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    await $fetch<unknown>(`/api/ai/keys/${provider.value}`, { method: 'PUT', body: { apiKey: apiKey.value.trim() } });
    apiKey.value = '';
    dialog.value?.close();
    emit('saved');
  } catch (caught) {
    error.value = getErrorMessage(caught, 'Clé refusée. Vérifiez-la et réessayez.');
  } finally {
    saving.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="m-auto w-[min(440px,calc(100%-24px))] rounded-xl border bg-surface p-5 text-text backdrop:bg-night/45" @click.self="dialog?.close()">
    <form class="flex flex-col gap-3 *:min-w-0" @submit.prevent="submit">
      <h2>Clé {{ definition.label }}</h2>
      <p class="text-xs text-muted">
        Créez une clé sur <a :href="definition.keysUrl" target="_blank" rel="noopener noreferrer">la console {{ definition.label }}</a>.
        Elle est vérifiée, chiffrée, puis utilisée uniquement pour vos conversations ; la facturation se fait sur votre compte {{ definition.label }}.
      </p>
      <label class="field">
        <span class="field-label">Clé d'API</span>
        <input ref="input" v-model="apiKey" class="input font-mono" type="password" autocomplete="off" spellcheck="false" maxlength="400" required>
      </label>
      <p v-if="error" class="alert alert-error">{{ error }}</p>
      <div class="grid grid-cols-[1fr_1fr] gap-2">
        <button class="btn" type="button" @click="dialog?.close()">Annuler</button>
        <button class="btn btn-ink" type="submit" :disabled="!apiKey.trim() || saving">
          <span v-if="saving" class="spinner" />{{ saving ? 'Vérification…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
