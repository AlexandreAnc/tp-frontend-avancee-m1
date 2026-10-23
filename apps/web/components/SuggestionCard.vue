<script setup lang="ts">
import type { IconName } from '~/utils/icons';

defineProps<{ title: string; description: string; icon: IconName; tone: string; busy?: boolean }>();
const emit = defineEmits<{ accept: []; ignore: [] }>();
</script>

<template>
  <article class="flex gap-3 rounded-lg border bg-surface p-[15px]">
    <span class="icon-tile size-9 rounded-sm" :class="tone"><AppIcon :name="icon" :size="14" /></span>
    <div class="min-w-0 flex-1">
      <strong class="font-extrabold">{{ title }}</strong>
      <p class="text-xs text-muted">{{ description }}</p>
      <div class="mt-2.5 flex items-center gap-2">
        <button class="btn btn-sm btn-ink" type="button" :disabled="busy" @click="emit('accept')">Accepter</button>
        <button class="btn btn-sm btn-ghost" type="button" :disabled="busy" @click="emit('ignore')">Ignorer</button>
      </div>
    </div>
  </article>
</template>
