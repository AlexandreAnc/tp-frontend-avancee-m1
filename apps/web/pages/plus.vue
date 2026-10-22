<script setup lang="ts">
useHead({ title: 'Plus · DashIA' });

const { me } = useMe();
const { signOut } = useAuth();
const pending = usePendingActions();

const TONES: Record<string, string> = {
  '/planning': 'tone-info',
  '/actions': 'tone-danger',
  '/routines': 'tone-primary',
  '/tags': 'tone-primary',
  '/journal': '',
  '/settings': '',
  '/admin/agents': 'tone-ink',
};

const items = computed(() => SECONDARY_NAV.filter((item) => !item.adminOnly || me.value?.isAdmin));
</script>

<template>
  <div>
    <PageHeader title="Plus" />
    <main class="page page-narrow">
      <NuxtLink v-if="me" to="/settings" class="card profile">
        <UserAvatar :name="me.user.name" :size="48" />
        <span class="grow">
          <strong>{{ me.user.name }}</strong>
          <span class="small muted">{{ me.user.email }}</span>
        </span>
        <AppIcon name="chevron-right" :size="12" class="muted" />
      </NuxtLink>

      <div class="card card-flush menu">
        <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="menu-row">
          <span class="icon-tile" :class="TONES[item.to]"><AppIcon :name="item.icon" :size="14" /></span>
          <strong class="grow">{{ item.label }}</strong>
          <span v-if="item.to === '/actions' && pending.count.value" class="count-badge">{{ pending.count.value }}</span>
          <AppIcon name="chevron-right" :size="12" class="muted" />
        </NuxtLink>
      </div>

      <button class="btn btn-lg btn-block logout" type="button" @click="signOut"><AppIcon name="logout" :size="14" />Se déconnecter</button>
    </main>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
  font-weight: 400;
}

.profile .grow {
  display: flex;
  flex-direction: column;
}

.profile strong {
  font-weight: 800;
}

.menu-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 0 16px;
  color: var(--text);
}

.menu-row + .menu-row {
  border-top: 1px solid var(--border);
}

.menu-row .icon-tile {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
}

.menu-row strong {
  font-weight: 800;
}

.logout {
  color: var(--danger);
}
</style>
