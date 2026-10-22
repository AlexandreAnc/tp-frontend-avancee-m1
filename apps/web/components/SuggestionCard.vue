<script setup lang="ts">
import type { IconName } from '~/utils/icons';

defineProps<{ title: string; description: string; icon: IconName; tone: string; busy?: boolean }>();
const emit = defineEmits<{ accept: []; ignore: [] }>();
</script>

<template>
  <article class="suggestion">
    <span class="icon-tile" :class="tone"><AppIcon :name="icon" :size="14" /></span>
    <div class="grow">
      <strong>{{ title }}</strong>
      <p class="small muted">{{ description }}</p>
      <div class="row buttons">
        <button class="btn btn-sm btn-ink" type="button" :disabled="busy" @click="emit('accept')">Accepter</button>
        <button class="btn btn-sm btn-ghost" type="button" :disabled="busy" @click="emit('ignore')">Ignorer</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.suggestion {
  display: flex;
  gap: 12px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.suggestion .icon-tile {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
}

.suggestion strong {
  font-weight: 800;
}

.buttons {
  margin-top: 10px;
}
</style>
