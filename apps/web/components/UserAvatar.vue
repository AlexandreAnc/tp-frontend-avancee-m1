<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 40 });

const initials = computed(() => props.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?');
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-linear-135/srgb from-primary-soft to-info-soft font-extrabold text-primary-strong"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }"
    aria-hidden="true"
  >
    {{ initials }}
  </span>
</template>
