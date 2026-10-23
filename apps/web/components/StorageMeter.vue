<script setup lang="ts">
const props = defineProps<{ usedBytes: number; maxBytes: number; compact?: boolean }>();

const ratio = computed(() => (props.maxBytes ? Math.min(1, props.usedBytes / props.maxBytes) : 0));
const tone = computed(() => (ratio.value >= 1 ? 'var(--color-danger)' : ratio.value >= 0.85 ? 'var(--color-warning-bright)' : 'var(--color-primary)'));
const label = computed(() => `${formatBytes(props.usedBytes)} / ${formatBytes(props.maxBytes)}`);
</script>

<template>
  <NuxtLink
    to="/drive"
    class="flex flex-col gap-1 font-bold text-muted"
    :class="compact ? 'items-end' : 'items-stretch'"
    role="meter"
    :aria-valuenow="usedBytes"
    aria-valuemin="0"
    :aria-valuemax="maxBytes"
    :aria-label="`Stockage utilisé : ${label}`"
  >
    <span class="inline-flex items-center gap-1 text-[10px] leading-[15px]"><AppIcon name="server" :size="10" />{{ label }}</span>
    <span class="meter" :class="compact ? 'w-16' : 'w-full'"><span :style="{ width: `${ratio * 100}%`, background: tone }" /></span>
  </NuxtLink>
</template>
