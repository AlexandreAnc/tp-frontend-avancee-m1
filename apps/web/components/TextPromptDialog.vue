<script setup lang="ts">
const emit = defineEmits<{ submit: [value: string] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const title = ref('');
const label = ref('');
const value = ref('');
const confirmLabel = ref('Valider');
const error = ref<string | null>(null);

function open(options: { title: string; label: string; value?: string; confirm?: string }) {
  title.value = options.title;
  label.value = options.label;
  value.value = options.value ?? '';
  confirmLabel.value = options.confirm ?? 'Valider';
  error.value = null;
  dialog.value?.showModal();
  void nextTick(() => {
    input.value?.focus();
    // Renommage : sélectionne le nom sans l'extension.
    const dot = value.value.lastIndexOf('.');
    input.value?.setSelectionRange(0, dot > 0 ? dot : value.value.length);
  });
}

function submit() {
  if (!value.value.trim()) return;
  emit('submit', value.value.trim());
  dialog.value?.close();
}

defineExpose({ open, close: () => dialog.value?.close(), setError: (message: string) => (error.value = message) });
</script>

<template>
  <dialog ref="dialog" class="prompt" @click.self="dialog?.close()">
    <form class="stack" @submit.prevent="submit">
      <h2>{{ title }}</h2>
      <label class="field">
        <span class="field-label">{{ label }}</span>
        <input ref="input" v-model="value" class="input" maxlength="255" required>
      </label>
      <p v-if="error" class="alert alert-error">{{ error }}</p>
      <div class="buttons">
        <button class="btn" type="button" @click="dialog?.close()">Annuler</button>
        <button class="btn btn-ink" type="submit" :disabled="!value.trim()">{{ confirmLabel }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.prompt {
  width: min(420px, calc(100% - 24px));
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
}

.prompt::backdrop {
  background: rgb(28 31 35 / 0.45);
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
