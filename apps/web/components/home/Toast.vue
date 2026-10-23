<script setup lang="ts">
const { toast, undo } = useHome();
let timer: ReturnType<typeof setTimeout> | undefined;

watch(toast, (value) => {
  clearTimeout(timer);
  if (value) timer = setTimeout(() => (toast.value = null), 6000);
});
</script>

<template>
  <div v-if="toast" class="fixed right-4 bottom-[calc(var(--nav-height)+16px+env(safe-area-inset-bottom))] left-4 z-30 mx-auto flex max-w-[480px] items-center gap-2.5 rounded-lg px-4 py-3 text-[13px] font-bold text-white shadow-dialog lg:bottom-6 lg:left-[calc(var(--sidebar-width)+16px)]" :class="toast.error ? 'bg-danger' : 'bg-night'" role="status">
    <AppIcon :name="toast.error ? 'circle-exclamation' : 'lightbulb'" :size="14" />
    <span class="min-w-0 flex-1">{{ toast.text }}</span>
    <button v-if="toast.activityId" class="text-btn text-[13px] text-emerald-light" type="button" @click="undo">Annuler</button>
  </div>
</template>
