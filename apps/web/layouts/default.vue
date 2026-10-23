<script setup lang="ts">
const route = useRoute();
const { me, refresh } = useMe();
const { online, agent } = useAgentStatus();
const { signOut } = useAuth();
const serverUnreachable = useServerUnreachable();
const pendingActions = usePendingActions();
const isOffline = ref(false);

useEvents((event) => {
  if (event.type === 'action.created' || event.type === 'action.updated') void pendingActions.refresh();
  if (event.type === 'file.updated' || event.type === 'file.deleted') void refresh();
});

function updateOnline() {
  isOffline.value = !navigator.onLine;
}

onMounted(() => {
  updateOnline();
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  refresh().catch(() => {});
  void pendingActions.refresh();
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline);
  window.removeEventListener('offline', updateOnline);
});

const secondary = computed(() => SECONDARY_NAV
  .filter((item) => !item.adminOnly || me.value?.isAdmin)
  .map((item) => (item.to === '/actions' ? { ...item, count: pendingActions.count.value } : item)));

/** « Plus » est actif sur toutes les pages secondaires. */
const plusActive = computed(() => route.path === '/plus' || secondary.value.some((item) => isRouteActive(route.path, item.to)));

const quota = computed(() => me.value?.quota ?? null);
const agentLabel = computed(() => {
  if (online.value === null) return 'Connexion…';
  if (!online.value) return 'Agent hors ligne';
  return agent.value ? `Agent en ligne · ${agent.value.name}` : 'Agent en ligne';
});
</script>

<template>
  <div class="min-h-dvh">
    <!-- Desktop : barre latérale -->
    <aside class="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-(--sidebar-width) lg:flex-col lg:gap-6 lg:border-r lg:bg-surface lg:px-4 lg:py-5" aria-label="Navigation principale">
      <NuxtLink to="/" class="flex items-center gap-3 font-extrabold text-text">
        <span class="relative inline-flex size-10 items-center justify-center rounded-md bg-ink text-on-ink">
          <AppIcon name="microchip" :size="18" /><span class="absolute -top-[3px] -right-[3px] size-3 rounded-full ring-3 ring-surface" :class="online ? 'bg-primary-bright' : 'bg-muted'" />
        </span>
        <span>
          <strong class="block text-base leading-5">DashIA</strong>
          <span class="flex items-center gap-1.5 text-2xs leading-4 font-bold" :class="online ? 'text-primary' : 'text-muted'"><span class="size-1.5 rounded-full bg-current" />{{ agentLabel }}</span>
        </span>
      </NuxtLink>

      <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        <NuxtLink
          v-for="item in PRIMARY_NAV"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-md px-3 py-2.5 font-bold"
          :class="isRouteActive(route.path, item.to) ? 'bg-ink text-on-ink' : 'text-muted hover:bg-surface-muted'"
        >
          <AppIcon :name="isRouteActive(route.path, item.to) && item.activeIcon ? item.activeIcon : item.icon" :size="16" />
          {{ item.label }}
        </NuxtLink>
        <div class="mx-3 my-2 h-px bg-border" />
        <NuxtLink
          v-for="item in secondary"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-md px-3 py-2.5 font-bold"
          :class="isRouteActive(route.path, item.to) ? 'bg-ink text-on-ink' : 'text-muted hover:bg-surface-muted'"
        >
          <AppIcon :name="item.icon" :size="16" />
          <span class="min-w-0 flex-1">{{ item.label }}</span>
          <span v-if="item.count" class="count-badge">{{ item.count }}</span>
        </NuxtLink>
      </nav>

      <div class="flex flex-col gap-4">
        <StorageMeter v-if="quota" :used-bytes="quota.usedBytes" :max-bytes="quota.maxBytes" />
        <div v-if="me" class="flex items-center gap-2.5 border-t pt-4">
          <UserAvatar :name="me.user.name" :size="32" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-xs font-extrabold">{{ me.user.name }}</div>
            <div class="truncate text-2xs text-muted">{{ me.user.email }}</div>
          </div>
          <button class="icon-btn" type="button" aria-label="Se déconnecter" @click="signOut"><AppIcon name="logout" /></button>
        </div>
      </div>
    </aside>

    <div class="flex min-h-dvh flex-col pb-[calc(var(--nav-height)+env(safe-area-inset-bottom))] lg:ml-(--sidebar-width) lg:pb-0">
      <div v-if="isOffline || serverUnreachable" class="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-xs leading-5 font-bold text-warning" role="status">
        <AppIcon name="triangle-exclamation" :size="12" />
        {{ isOffline ? 'Vous êtes hors ligne' : 'Serveur injoignable' }} : l'historique reste consultable, les envois reprendront au retour du réseau.
      </div>
      <slot />
    </div>

    <!-- Mobile : barre d'onglets -->
    <nav class="fixed inset-x-0 bottom-0 z-20 flex border-t bg-surface-glass pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-xs lg:hidden" aria-label="Navigation principale">
      <NuxtLink
        v-for="item in PRIMARY_NAV"
        :key="item.to"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-1 text-[10px] leading-[15px]"
        :class="isRouteActive(route.path, item.to) ? 'font-extrabold text-primary-strong' : 'font-bold text-muted'"
      >
        <AppIcon :name="isRouteActive(route.path, item.to) && item.activeIcon ? item.activeIcon : item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </NuxtLink>
      <NuxtLink to="/plus" class="flex flex-1 flex-col items-center gap-1 text-[10px] leading-[15px]" :class="plusActive ? 'font-extrabold text-primary-strong' : 'font-bold text-muted'">
        <span class="relative inline-flex">
          <AppIcon name="grid" :size="17" />
          <span v-if="pendingActions.count.value" class="absolute -top-0.5 -right-1 size-2 rounded-full bg-danger" />
        </span>
        <span>Plus</span>
      </NuxtLink>
    </nav>
  </div>
</template>
