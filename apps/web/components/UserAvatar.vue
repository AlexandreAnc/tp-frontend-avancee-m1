<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 40 });

const initials = computed(() => props.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?');
</script>

<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }" aria-hidden="true">
    {{ initials }}
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-soft), var(--info-soft));
  color: var(--primary-strong);
  font-weight: 800;
}
</style>
