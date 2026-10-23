<script setup lang="ts">
const { home, busy, refresh, toggleRoom, scene, lightsOn } = useHome();
onMounted(refresh);

const rooms = computed(() => (home.value?.rooms ?? []).filter((room) => room.kind === 'room').slice(0, 6));
</script>

<template>
  <PanelCard title="Maison" icon="lightbulb" tone="warning" :link="home?.connected ? { to: '/maison', label: `${lightsOn} lampe${lightsOn > 1 ? 's' : ''} allumée${lightsOn > 1 ? 's' : ''}` } : undefined">
    <template v-if="home?.connected">
      <div v-if="home.scenes.length" class="chips">
        <button v-for="item in home.scenes.slice(0, 6)" :key="item.id" class="chip" type="button" :disabled="busy === item.id" @click="scene(item.id, item.name)">
          <AppIcon name="book-open" :size="12" />{{ item.name }}
        </button>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <HomeRoomTile v-for="room in rooms" :key="room.id" :room="room" :busy="busy === room.id" @toggle="toggleRoom(room)" @select="navigateTo('/maison')" />
      </div>
    </template>
    <div v-else class="empty-state">
      <span class="icon-tile tone-warning"><AppIcon name="lightbulb" :size="16" /></span>
      <strong>Maison non reliée</strong>
      <NuxtLink to="/maison" class="text-btn">Connecter Hue</NuxtLink>
    </div>
  </PanelCard>
</template>
