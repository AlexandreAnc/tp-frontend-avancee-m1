<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';

/** Carte affichée dans la discussion quand l'agent a demandé une action (en attente ou exécutée). */
const props = defineProps<{ output: { status: 'pending'; actionId: string } | { status: 'executed'; activityId: string }; summary: string }>();

const action = ref<ApiResponse<'/api/actions/:id', 'get'>['action'] | null>(null);
const undone = ref(false);
const error = ref<string | null>(null);

async function load() {
  if (props.output.status !== 'pending') return;
  try {
    action.value = (await $fetch<ApiResponse<'/api/actions/:id', 'get'>>(`/api/actions/${props.output.actionId}`)).action;
  } catch {
    action.value = null;
  }
}

useEvents((event) => {
  if (event.type === 'action.updated' && props.output.status === 'pending' && event.actionId === props.output.actionId) void load();
});
onMounted(load);

const status = computed(() => (action.value ? ACTION_STATUS_LABELS[action.value.status] : null));

async function undo() {
  if (props.output.status !== 'executed') return;
  error.value = null;
  try {
    await $fetch(`/api/activity/${props.output.activityId}/undo`, { method: 'POST' });
    undone.value = true;
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}
</script>

<template>
  <div
    class="flex flex-col items-start gap-2 rounded-lg border p-[15px]"
    :class="output.status === 'pending' && action?.status === 'pending' ? 'border-amber bg-[color-mix(in_srgb,var(--color-warning-soft)_60%,var(--color-surface))]' : 'bg-surface'"
  >
    <template v-if="output.status === 'pending'">
      <span v-if="status" class="badge" :class="status.tone"><AppIcon :name="status.icon" :size="10" />{{ action?.status === 'pending' ? 'En attente de validation' : status.label }}</span>
      <strong class="font-extrabold">{{ action?.summary ?? summary }}</strong>
      <div class="flex gap-2">
        <NuxtLink :to="`/actions/${output.actionId}`" class="btn btn-sm btn-ink">Voir l'action</NuxtLink>
      </div>
    </template>
    <template v-else>
      <span class="badge" :class="undone ? '' : 'tone-primary'"><AppIcon :name="undone ? 'ban' : 'check'" :size="10" />{{ undone ? 'Annulé' : 'Fait' }}</span>
      <strong class="font-extrabold">{{ summary }}</strong>
      <div v-if="!undone" class="flex gap-2">
        <button class="btn btn-sm" type="button" @click="undo">Annuler</button>
        <NuxtLink to="/journal" class="btn btn-sm btn-ghost">Journal</NuxtLink>
      </div>
      <p v-if="error" class="text-xs text-danger">{{ error }}</p>
    </template>
  </div>
</template>
