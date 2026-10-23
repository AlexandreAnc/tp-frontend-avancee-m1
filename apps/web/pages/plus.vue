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
      <NuxtLink v-if="me" to="/settings" class="card flex items-center gap-3 font-normal text-text">
        <UserAvatar :name="me.user.name" :size="48" />
        <span class="flex min-w-0 flex-1 flex-col">
          <strong class="font-extrabold">{{ me.user.name }}</strong>
          <span class="text-xs text-muted">{{ me.user.email }}</span>
        </span>
        <AppIcon name="chevron-right" :size="12" class="text-muted" />
      </NuxtLink>

      <div class="card card-flush [&>*+*]:border-t">
        <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="flex min-h-[60px] items-center gap-3 px-4 text-text">
          <span class="icon-tile size-9 rounded-sm" :class="TONES[item.to]"><AppIcon :name="item.icon" :size="14" /></span>
          <strong class="min-w-0 flex-1 font-extrabold">{{ item.label }}</strong>
          <span v-if="item.to === '/actions' && pending.count.value" class="count-badge">{{ pending.count.value }}</span>
          <AppIcon name="chevron-right" :size="12" class="text-muted" />
        </NuxtLink>
      </div>

      <button class="btn btn-lg btn-block text-danger" type="button" @click="signOut"><AppIcon name="logout" :size="14" />Se déconnecter</button>
    </main>
  </div>
</template>
