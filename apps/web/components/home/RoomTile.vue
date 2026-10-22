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
  <div class="tile" :class="{ on: room.on, selected }">
    <button class="toggle" type="button" :disabled="busy" :aria-pressed="room.on" :aria-label="`${room.on ? 'Éteindre' : 'Allumer'} ${room.name}`" @click="emit('toggle')">
      <span v-if="busy" class="spinner" />
      <AppIcon v-else :name="icon" :size="16" />
    </button>
    <button class="info" type="button" @click="emit('select')">
      <strong class="ellipsis">{{ room.name }}</strong>
      <span class="tiny">{{ room.on ? `${onCount}/${room.lights.length}${room.brightness ? ` · ${room.brightness} %` : ''}` : 'Éteint' }}</span>
    </button>
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-muted);
  color: var(--text-muted);
}

.tile.on {
  background: var(--warning-soft);
  color: var(--warning-bright);
}

.tile.selected {
  box-shadow: 0 0 0 2px var(--ink);
}

.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius);
  background: var(--surface);
  color: inherit;
  cursor: pointer;
}

.info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: none;
  background: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.info strong {
  max-width: 100%;
  color: var(--text);
  font-weight: 800;
}

.info .tiny {
  color: var(--text-muted);
}
</style>
