<script setup lang="ts">
const { request, answer } = useConfirm();
const dialog = ref<HTMLDialogElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);

watch(request, (value) => {
  if (value && !dialog.value?.open) {
    dialog.value?.showModal();
    void nextTick(() => confirmButton.value?.focus());
  } else if (!value) {
    dialog.value?.close();
  }
});
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(420px,calc(100%-24px))] rounded-xl border bg-surface p-5 text-text backdrop:bg-night/45"
    aria-labelledby="confirm-title"
    @close="answer(false)"
    @click.self="answer(false)"
  >
    <div v-if="request" class="flex flex-col gap-3 *:min-w-0">
      <h2 id="confirm-title" class="text-[17px]">{{ request.title }}</h2>
      <p v-if="request.message" class="text-xs text-muted">{{ request.message }}</p>
      <div class="grid grid-cols-[1fr_1fr] gap-2">
        <button class="btn" type="button" @click="answer(false)">Annuler</button>
        <button ref="confirmButton" class="btn" :class="request.danger ? 'btn-danger' : 'btn-ink'" type="button" @click="answer(true)">
          {{ request.confirm ?? 'Confirmer' }}
        </button>
      </div>
    </div>
  </dialog>
</template>
