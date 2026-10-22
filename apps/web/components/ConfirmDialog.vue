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
  <dialog ref="dialog" class="confirm-dialog" aria-labelledby="confirm-title" @close="answer(false)" @click.self="answer(false)">
    <div v-if="request" class="stack">
      <h2 id="confirm-title">{{ request.title }}</h2>
      <p v-if="request.message" class="small muted">{{ request.message }}</p>
      <div class="buttons">
        <button class="btn" type="button" @click="answer(false)">Annuler</button>
        <button ref="confirmButton" class="btn" :class="request.danger ? 'btn-danger' : 'btn-ink'" type="button" @click="answer(true)">
          {{ request.confirm ?? 'Confirmer' }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(420px, calc(100% - 24px));
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
}

.confirm-dialog::backdrop {
  background: rgb(28 31 35 / 0.45);
}

.confirm-dialog h2 {
  font-size: 17px;
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
