<script setup lang="ts">
const props = defineProps<{ usedBytes: number; maxBytes: number; compact?: boolean }>();

const ratio = computed(() => (props.maxBytes ? Math.min(1, props.usedBytes / props.maxBytes) : 0));
const tone = computed(() => (ratio.value >= 1 ? 'var(--danger)' : ratio.value >= 0.85 ? 'var(--warning-bright)' : 'var(--primary)'));
const label = computed(() => `${formatBytes(props.usedBytes)} / ${formatBytes(props.maxBytes)}`);
</script>

<template>
  <NuxtLink
    to="/drive"
    class="storage"
    :class="{ compact }"
    role="meter"
    :aria-valuenow="usedBytes"
    aria-valuemin="0"
    :aria-valuemax="maxBytes"
    :aria-label="`Stockage utilisé : ${label}`"
  >
    <span class="label"><AppIcon name="server" :size="10" />{{ label }}</span>
    <span class="meter"><span :style="{ width: `${ratio * 100}%`, background: tone }" /></span>
  </NuxtLink>
</template>

<style scoped>
.storage {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: var(--text-muted);
  font-weight: 700;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  line-height: 15px;
}

.meter {
  width: 64px;
}

.storage:not(.compact) {
  align-items: stretch;
}

.storage:not(.compact) .meter {
  width: 100%;
}
</style>
