<script setup lang="ts">
import type { IconName } from '~/utils/icons';

export interface MenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  /** Coche affichée à droite (tri actif, favori…). */
  checked?: boolean;
  action: () => void;
}

const props = defineProps<{ items: MenuItem[]; label: string }>();
const open = ref(false);
/** Ouvre le menu vers le haut quand il n'y a pas la place en dessous (bas de page, barre d'onglets mobile). */
const up = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const entries = ref<HTMLButtonElement[]>([]);
const menuId = useId();

function focusEntry(index: number) {
  const count = props.items.length;
  entries.value[((index % count) + count) % count]?.focus();
}

async function show(focusIndex = 0) {
  if (root.value) up.value = window.innerHeight - root.value.getBoundingClientRect().bottom < 280;
  open.value = true;
  await nextTick();
  focusEntry(focusIndex);
}

function hide(returnFocus = true) {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) trigger.value?.focus();
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    void show(event.key === 'ArrowDown' ? 0 : -1);
  }
}

function onMenuKeydown(event: KeyboardEvent) {
  const current = entries.value.indexOf(document.activeElement as HTMLButtonElement);
  const moves: Record<string, number> = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: -1 };
  if (event.key in moves) {
    event.preventDefault();
    focusEntry(moves[event.key]!);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    hide();
  } else if (event.key === 'Tab') {
    hide(false);
  }
}

function onDocumentPointer(event: Event) {
  if (!root.value?.contains(event.target as Node)) hide(false);
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer));

function run(item: MenuItem) {
  hide();
  item.action();
}
</script>

<template>
  <div ref="root" class="menu-root" @click.stop @dblclick.stop>
    <button
      ref="trigger"
      class="icon-btn trigger"
      type="button"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      @click="open ? hide() : show()"
      @keydown="onTriggerKeydown"
    >
      <span class="dots" aria-hidden="true">•••</span>
    </button>
    <ul v-if="open" :id="menuId" class="menu" :class="{ up }" role="menu" :aria-label="label" @keydown="onMenuKeydown">
      <li v-for="item in items" :key="item.label" role="none">
        <button
          ref="entries"
          type="button"
          :role="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
          :aria-checked="item.checked"
          tabindex="-1"
          :class="{ danger: item.danger }"
          @click="run(item)"
        >
          <AppIcon :name="item.icon" :size="13" /><span class="grow">{{ item.label }}</span>
          <AppIcon v-if="item.checked" name="check" :size="11" class="tick" />
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
  min-width: 210px;
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
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.menu button:hover,
.menu button:focus-visible {
  background: var(--surface-muted);
  outline: none;
}

.menu button.danger {
  color: var(--danger);
}

.tick {
  color: var(--primary);
}
</style>
