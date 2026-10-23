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
  <div ref="root" class="relative" @click.stop @dblclick.stop>
    <button
      ref="trigger"
      class="icon-btn size-8"
      type="button"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      @click="open ? hide() : show()"
      @keydown="onTriggerKeydown"
    >
      <span class="text-[8px] tracking-[1px]" aria-hidden="true">•••</span>
    </button>
    <ul
      v-if="open"
      :id="menuId"
      class="absolute right-0 z-40 m-0 min-w-[210px] list-none rounded-md border bg-surface p-1.5 shadow-popover"
      :class="up ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'"
      role="menu"
      :aria-label="label"
      @keydown="onMenuKeydown"
    >
      <li v-for="item in items" :key="item.label" role="none">
        <button
          ref="entries"
          type="button"
          :role="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
          :aria-checked="item.checked"
          tabindex="-1"
          class="flex w-full cursor-pointer items-center gap-2.5 rounded-sm bg-transparent px-2.5 py-[9px] text-left text-[13px] font-bold hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
          :class="item.danger ? 'text-danger' : 'text-text'"
          @click="run(item)"
        >
          <AppIcon :name="item.icon" :size="13" /><span class="min-w-0 flex-1">{{ item.label }}</span>
          <AppIcon v-if="item.checked" name="check" :size="11" class="text-primary" />
        </button>
      </li>
    </ul>
  </div>
</template>
