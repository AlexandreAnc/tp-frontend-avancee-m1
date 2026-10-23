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
  <div class="flex flex-col gap-2.5">
    <div v-if="suggestions?.length" class="chips">
      <button v-for="suggestion in suggestions" :key="suggestion" class="chip" type="button" @click="emit('send', suggestion)">{{ suggestion }}</button>
    </div>
    <p v-if="error" class="alert alert-error">{{ error }}</p>
    <form class="flex items-center gap-2 rounded-lg border bg-surface py-1.5 pr-1.5 pl-3 focus-within:border-primary" @submit.prevent="submit">
      <button class="inline-flex cursor-pointer bg-transparent px-1.5 py-px text-muted" type="button" :disabled="uploading" aria-label="Joindre un document" @click="fileInput?.click()">
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
        class="max-h-[140px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none [field-sizing:content]"
        :maxlength="MAX_CHAT_MESSAGE_LENGTH"
        :placeholder="placeholder ?? 'Écrire à l’agent…'"
        @keydown="onKeydown"
      />
      <button class="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary text-white disabled:cursor-not-allowed disabled:bg-border disabled:text-muted" type="submit" :disabled="!canSend" aria-label="Envoyer"><AppIcon name="arrow-up" :size="14" /></button>
    </form>
  </div>
</template>
