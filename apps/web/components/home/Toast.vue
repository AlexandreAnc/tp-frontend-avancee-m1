<script setup lang="ts">
const { toast, undo } = useHome();
let timer: ReturnType<typeof setTimeout> | undefined;

watch(toast, (value) => {
  clearTimeout(timer);
  if (value) timer = setTimeout(() => (toast.value = null), 6000);
});
</script>

<template>
  <div v-if="toast" class="toast" :class="{ error: toast.error }" role="status">
    <AppIcon :name="toast.error ? 'circle-exclamation' : 'lightbulb'" :size="14" />
    <span class="grow">{{ toast.text }}</span>
    <button v-if="toast.activityId" class="text-btn undo" type="button" @click="undo">Annuler</button>
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(var(--nav-height) + 16px + env(safe-area-inset-bottom));
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 480px;
  margin: 0 auto;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: #1c1f23;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.25);
}

.toast.error {
  background: var(--danger);
}

.undo {
  color: #34d399;
  font-size: 13px;
}

@media (min-width: 1024px) {
  .toast {
    bottom: 24px;
    left: calc(var(--sidebar-width) + 16px);
  }
}
</style>
