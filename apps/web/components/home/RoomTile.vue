<script setup lang="ts">
import type { HomeRoom } from '@app/shared';
import type { IconName } from '~/utils/icons';

const props = defineProps<{ room: HomeRoom; busy?: boolean; selected?: boolean }>();
const emit = defineEmits<{ toggle: []; select: [] }>();

const ICONS: Record<string, IconName> = {
  living_room: 'couch',
  kitchen: 'utensils',
  bedroom: 'bed',
  kids_bedroom: 'bed',
  office: 'laptop',
  dining: 'utensils',
};
const icon = computed<IconName>(() => ICONS[props.room.archetype ?? ''] ?? 'lightbulb');
const onCount = computed(() => props.room.lights.filter((light) => light.on).length);
</script>

<template>
  <div class="flex flex-col gap-2.5 rounded-lg p-3" :class="[room.on ? 'bg-warning-soft text-warning-bright' : 'bg-surface-muted text-muted', { 'ring-2 ring-ink': selected }]">
    <button class="inline-flex size-9 cursor-pointer items-center justify-center rounded-md bg-surface" type="button" :disabled="busy" :aria-pressed="room.on" :aria-label="`${room.on ? 'Éteindre' : 'Allumer'} ${room.name}`" @click="emit('toggle')">
      <span v-if="busy" class="spinner" />
      <AppIcon v-else :name="icon" :size="16" />
    </button>
    <button class="flex min-w-0 cursor-pointer flex-col items-start p-0 text-left" type="button" @click="emit('select')">
      <strong class="max-w-full truncate font-extrabold text-text">{{ room.name }}</strong>
      <span class="text-2xs text-muted">{{ room.on ? `${onCount}/${room.lights.length}${room.brightness ? ` · ${room.brightness} %` : ''}` : 'Éteint' }}</span>
    </button>
  </div>
</template>
