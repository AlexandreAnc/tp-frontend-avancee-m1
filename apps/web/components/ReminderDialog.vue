<script setup lang="ts">
const props = defineProps<{ defaultDate?: Date }>();
const emit = defineEmits<{ created: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const text = ref('');
const date = ref('');
const time = ref('09:00');
const busy = ref(false);
const error = ref<string | null>(null);

function toInputDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function open(preset?: { text?: string; date?: Date }) {
  text.value = preset?.text ?? '';
  date.value = toInputDate(preset?.date ?? props.defaultDate ?? new Date());
  error.value = null;
  dialog.value?.showModal();
}

function quick(minutes: number | 'evening' | 'tomorrow') {
  const target = new Date();
  if (minutes === 'evening') target.setHours(19, 0, 0, 0);
  else if (minutes === 'tomorrow') {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else target.setMinutes(target.getMinutes() + minutes);
  date.value = toInputDate(target);
  time.value = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
}

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    await $fetch('/api/reminders', { method: 'POST', body: { text: text.value, remindAt: new Date(`${date.value}T${time.value}`).toISOString() } });
    dialog.value?.close();
    emit('created');
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="m-auto w-[min(440px,calc(100%-24px))] rounded-xl border bg-surface p-5 text-text backdrop:bg-night/45" aria-labelledby="reminder-title">
    <form class="flex flex-col gap-3 *:min-w-0" @submit.prevent="submit">
      <div class="flex items-center justify-between gap-2">
        <h2 id="reminder-title">Nouveau rappel</h2>
        <button class="icon-btn" type="button" aria-label="Fermer" @click="dialog?.close()"><AppIcon name="xmark" /></button>
      </div>
      <label class="field">
        <span class="field-label">Rappel</span>
        <input v-model="text" class="input" required maxlength="300" placeholder="Payer la facture EDF">
      </label>
      <div class="chips">
        <button class="chip" type="button" @click="quick(60)">Dans 1 h</button>
        <button class="chip" type="button" @click="quick('evening')">Ce soir</button>
        <button class="chip" type="button" @click="quick('tomorrow')">Demain 9h</button>
      </div>
      <div class="grid grid-cols-[1fr_1fr] gap-2">
        <label class="field"><span class="field-label">Jour</span><input v-model="date" class="input" type="date" required></label>
        <label class="field"><span class="field-label">Heure</span><input v-model="time" class="input" type="time" required></label>
      </div>
      <p class="text-xs text-muted">Vous recevrez une notification à l'heure dite.</p>
      <p v-if="error" class="alert alert-error">{{ error }}</p>
      <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="busy">Programmer le rappel</button>
    </form>
  </dialog>
</template>
