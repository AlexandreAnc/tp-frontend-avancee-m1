<script setup lang="ts">
import type { IconName } from '~/utils/icons';

export interface MenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  action: () => void;
}

defineProps<{ items: MenuItem[]; label: string }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
/** Ouvre le menu vers le haut quand il n'y a pas la place en dessous (bas de page, barre d'onglets mobile). */
const up = ref(false);

function toggle() {
  if (!open.value && root.value) up.value = window.innerHeight - root.value.getBoundingClientRect().bottom < 280;
  open.value = !open.value;
}

function onDocumentClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

function run(item: MenuItem) {
  open.value = false;
  item.action();
}
</script>

<template>
  <div ref="root" class="menu-root" @click.stop>
    <button class="icon-btn trigger" type="button" :aria-label="label" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
      <span class="dots" aria-hidden="true">•••</span>
    </button>
    <ul v-if="open" class="menu" :class="{ up }" role="menu" @keydown.esc="open = false">
      <li v-for="item in items" :key="item.label" role="none">
        <button type="button" role="menuitem" :class="{ danger: item.danger }" @click="run(item)">
          <AppIcon :name="item.icon" :size="13" />{{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.menu-root {
  position: relative;
}

.trigger {
  width: 32px;
  height: 32px;
}

.dots {
  font-size: 8px;
  letter-spacing: 1px;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 40;
  min-width: 200px;
  margin: 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.15);
}

.menu.up {
  top: auto;
  bottom: calc(100% + 4px);
}

.menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.menu button:hover {
  background: var(--surface-muted);
}

.menu button.danger {
  color: var(--danger);
}
</style>
