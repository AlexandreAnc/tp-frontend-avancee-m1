<script setup lang="ts">
import { MAX_CHAT_MESSAGE_LENGTH } from '@app/shared';

const props = defineProps<{ disabled?: boolean; placeholder?: string; suggestions?: string[] }>();
const emit = defineEmits<{ send: [content: string] }>();
const content = defineModel<string>({ default: '' });
const textarea = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const error = ref<string | null>(null);

const canSend = computed(() => !props.disabled && content.value.trim().length > 0 && content.value.length <= MAX_CHAT_MESSAGE_LENGTH);

function submit() {
  if (!canSend.value) return;
  emit('send', content.value.trim());
  content.value = '';
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}

/** Joindre un document : il est ajouté au drive, puis cité dans le message. */
async function attach(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  uploading.value = true;
  error.value = null;
  try {
    await $fetch('/api/files', { method: 'POST', body: file, headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' } });
    content.value = `${content.value ? `${content.value} ` : ''}À propos du document « ${file.name} » : `;
    textarea.value?.focus();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    uploading.value = false;
  }
}

onMounted(() => textarea.value?.focus());
</script>

<template>
  <div class="composer-wrap">
    <div v-if="suggestions?.length" class="chips">
      <button v-for="suggestion in suggestions" :key="suggestion" class="chip" type="button" @click="emit('send', suggestion)">{{ suggestion }}</button>
    </div>
    <p v-if="error" class="alert alert-error">{{ error }}</p>
    <form class="composer" @submit.prevent="submit">
      <button class="attach" type="button" :disabled="uploading" aria-label="Joindre un document" @click="fileInput?.click()">
        <span v-if="uploading" class="spinner" />
        <AppIcon v-else name="paperclip" :size="16" />
      </button>
      <input ref="fileInput" type="file" class="sr-only" @change="attach">
      <label for="composer-input" class="sr-only">Votre message</label>
      <textarea
        id="composer-input"
        ref="textarea"
        v-model="content"
        rows="1"
        :maxlength="MAX_CHAT_MESSAGE_LENGTH"
        :placeholder="placeholder ?? 'Écrire à l’agent…'"
        @keydown="onKeydown"
      />
      <button class="send" type="submit" :disabled="!canSend" aria-label="Envoyer"><AppIcon name="arrow-up" :size="14" /></button>
    </form>
  </div>
</template>

<style scoped>
.composer-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.composer:focus-within {
  border-color: var(--primary);
}

.composer textarea {
  flex: 1;
  min-width: 0;
  max-height: 140px;
  padding: 8px 4px;
  border: none;
  background: none;
  resize: none;
  font-size: 14px;
  line-height: 20px;
  outline: none;
  field-sizing: content;
}

.attach {
  display: inline-flex;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius);
  background: var(--primary);
  color: #fff;
  cursor: pointer;
}

.send:disabled {
  background: var(--border);
  color: var(--text-muted);
  cursor: not-allowed;
}
</style>
