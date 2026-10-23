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
  <header class="z-5 border-b bg-bg/90 backdrop-blur-xs" :class="{ 'sticky top-0': sticky }">
    <div class="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] lg:px-8">
      <button v-if="back" class="icon-btn lg:hidden" type="button" aria-label="Retour" @click="goBack(back)">
        <AppIcon name="arrow-left" />
      </button>
      <div class="flex min-w-0 flex-1 flex-col gap-[3px]">
        <h1 class="truncate">{{ title }}</h1>
        <p v-if="subtitle" class="truncate text-2xs font-extrabold text-muted">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.below" class="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-4 pb-3 lg:px-8">
      <slot name="below" />
    </div>
  </header>
</template>
