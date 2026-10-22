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
  <div class="shell">
    <!-- Desktop : barre latérale -->
    <aside class="sidebar" aria-label="Navigation principale">
      <NuxtLink to="/" class="brand">
        <span class="brand-logo"><AppIcon name="microchip" :size="18" /><span class="brand-dot" :class="{ off: !online }" /></span>
        <span>
          <strong>DashIA</strong>
          <span class="agent-line" :class="{ on: online }"><span class="dot" />{{ agentLabel }}</span>
        </span>
      </NuxtLink>

      <nav class="side-nav">
        <NuxtLink v-for="item in PRIMARY_NAV" :key="item.to" :to="item.to" class="side-link" :class="{ active: isRouteActive(route.path, item.to) }">
          <AppIcon :name="isRouteActive(route.path, item.to) && item.activeIcon ? item.activeIcon : item.icon" :size="16" />
          {{ item.label }}
        </NuxtLink>
        <div class="side-sep" />
        <NuxtLink v-for="item in secondary" :key="item.to" :to="item.to" class="side-link" :class="{ active: isRouteActive(route.path, item.to) }">
          <AppIcon :name="item.icon" :size="16" />
          <span class="grow">{{ item.label }}</span>
          <span v-if="item.count" class="count-badge">{{ item.count }}</span>
        </NuxtLink>
      </nav>

      <div class="side-footer">
        <StorageMeter v-if="quota" :used-bytes="quota.usedBytes" :max-bytes="quota.maxBytes" />
        <div v-if="me" class="side-user">
          <UserAvatar :name="me.user.name" :size="32" />
          <div class="grow">
            <div class="small strong ellipsis">{{ me.user.name }}</div>
            <div class="tiny muted ellipsis">{{ me.user.email }}</div>
          </div>
          <button class="icon-btn" type="button" aria-label="Se déconnecter" @click="signOut"><AppIcon name="logout" /></button>
        </div>
      </div>
    </aside>

    <div class="main-col">
      <div v-if="isOffline || serverUnreachable" class="offline-banner" role="status">
        <AppIcon name="triangle-exclamation" :size="12" />
        {{ isOffline ? 'Vous êtes hors ligne' : 'Serveur injoignable' }} : l'historique reste consultable, les envois reprendront au retour du réseau.
      </div>
      <slot />
    </div>

    <!-- Mobile : barre d'onglets -->
    <nav class="tabbar" aria-label="Navigation principale">
      <NuxtLink v-for="item in PRIMARY_NAV" :key="item.to" :to="item.to" class="tab" :class="{ active: isRouteActive(route.path, item.to) }">
        <AppIcon :name="isRouteActive(route.path, item.to) && item.activeIcon ? item.activeIcon : item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </NuxtLink>
      <NuxtLink to="/plus" class="tab" :class="{ active: plusActive }">
        <span class="tab-icon">
          <AppIcon name="grid" :size="17" />
          <span v-if="pendingActions.count.value" class="tab-dot" />
        </span>
        <span>Plus</span>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
}

.main-col {
  min-height: 100dvh;
  padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}

.offline-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

/* ── Barre d'onglets (mobile) ───────────────────────────── */

.tabbar {
  position: fixed;
  inset: auto 0 0;
  z-index: 20;
  display: flex;
  padding: 8px 0 max(8px, env(safe-area-inset-bottom));
  background: var(--surface-glass);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(4px);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 15px;
  font-weight: 700;
}

.tab.active {
  color: var(--primary-strong);
  font-weight: 800;
}

.tab-icon {
  position: relative;
  display: inline-flex;
}

.tab-dot {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}

/* ── Barre latérale (desktop) ───────────────────────────── */

.sidebar {
  display: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
  font-weight: 800;
}

.brand strong {
  display: block;
  font-size: 16px;
  line-height: 20px;
}

.brand-logo {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--on-ink);
}

.brand-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--primary-bright);
  box-shadow: 0 0 0 3px var(--surface);
}

.brand-dot.off {
  background: var(--text-muted);
}

.agent-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
  color: var(--text-muted);
}

.agent-line .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.agent-line.on {
  color: var(--primary);
}

.side-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow-y: auto;
}

.side-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  color: var(--text-muted);
  font-weight: 700;
}

.side-link:hover {
  background: var(--surface-muted);
}

.side-link.active {
  background: var(--ink);
  color: var(--on-ink);
}

.side-sep {
  height: 1px;
  margin: 8px 12px;
  background: var(--border);
}

.side-footer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.side-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

@media (min-width: 1024px) {
  .tabbar {
    display: none;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--sidebar-width);
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 20px 16px;
    background: var(--surface);
    border-right: 1px solid var(--border);
  }

  .main-col {
    margin-left: var(--sidebar-width);
    padding-bottom: 0;
  }
}
</style>
