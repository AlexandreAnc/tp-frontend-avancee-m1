<script setup lang="ts">
withDefaults(defineProps<{ title: string; subtitle?: string; back?: string | boolean; sticky?: boolean }>(), { subtitle: undefined, back: false, sticky: true });

const router = useRouter();

function goBack(target: string | boolean) {
  if (typeof target === 'string') return navigateTo(target);
  if (window.history.length > 1) return router.back();
  return navigateTo('/');
}
</script>

<template>
  <header class="page-header" :class="{ sticky }">
    <div class="inner">
      <button v-if="back" class="icon-btn back" type="button" aria-label="Retour" @click="goBack(back)">
        <AppIcon name="arrow-left" />
      </button>
      <div class="titles grow">
        <h1 class="ellipsis">{{ title }}</h1>
        <p v-if="subtitle" class="tiny muted strong ellipsis">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
      <div class="actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.below" class="below">
      <slot name="below" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  background: color-mix(in srgb, var(--bg) 90%, transparent);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(4px);
  z-index: 5;
}

.page-header.sticky {
  position: sticky;
  top: 0;
}

.inner,
.below {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
}

.inner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.below {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 1024px) {
  .inner,
  .below {
    padding-left: 32px;
    padding-right: 32px;
  }

  .back {
    display: none;
  }
}
</style>
