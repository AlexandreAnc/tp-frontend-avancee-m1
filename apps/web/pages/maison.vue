<script setup lang="ts">
useHead({ title: 'Maison · DashIA' });

const route = useRoute();
const { home, loading, busy, refresh, toggleRoom, dimRoom, allOff, scene, toggleLight, lightsOn } = useHome();
const { data: connectorsData } = await useFetch('/api/connectors', { key: 'connectors' });
const { ask } = useConfirm();
const selectedRoomId = ref<string | null>(null);

await refresh();

const STATUS_MESSAGES: Record<string, { tone: string; text: string }> = {
  connected: { tone: 'alert-success', text: 'Philips Hue est connecté : vos lampes sont pilotables depuis DashIA.' },
  cancelled: { tone: 'alert-warning', text: 'Connexion à Philips Hue annulée.' },
  error: { tone: 'alert-error', text: 'La connexion à Philips Hue a échoué. Vérifiez que le pont est en ligne puis réessayez.' },
};
const status = computed(() => (typeof route.query.status === 'string' ? STATUS_MESSAGES[route.query.status] : null));
const hueConnector = computed(() => connectorsData.value?.connectors.find((connector) => connector.provider === 'hue'));

const rooms = computed(() => (home.value?.rooms ?? []).filter((room) => room.kind === 'room'));
const zones = computed(() => (home.value?.rooms ?? []).filter((room) => room.kind === 'zone'));
const selectedRoom = computed(() => rooms.value.find((room) => room.id === selectedRoomId.value) ?? rooms.value[0] ?? null);
const roomScenes = computed(() => (home.value?.scenes ?? []).filter((item) => !selectedRoom.value || item.roomId === selectedRoom.value.id));

let dimTimer: ReturnType<typeof setTimeout> | undefined;
function onDim(event: Event) {
  const room = selectedRoom.value;
  if (!room) return;
  const value = Number((event.target as HTMLInputElement).value);
  clearTimeout(dimTimer);
  dimTimer = setTimeout(() => dimRoom(room, value), 300);
}

async function disconnect() {
  if (!await ask({ title: 'Déconnecter Philips Hue ?', message: 'Les routines qui pilotent vos lampes ne fonctionneront plus.', confirm: 'Déconnecter', danger: true })) return;
  await $fetch('/api/connectors/hue', { method: 'DELETE' });
  await refresh();
}
</script>

<template>
  <div>
    <PageHeader title="Maison" :subtitle="home?.connected ? `${lightsOn} lampe${lightsOn > 1 ? 's' : ''} allumée${lightsOn > 1 ? 's' : ''}` : 'Philips Hue'">
      <template v-if="home?.connected" #actions>
        <button class="icon-btn" type="button" aria-label="Actualiser" :disabled="loading" @click="refresh"><AppIcon name="rotate-right" /></button>
        <button class="btn btn-sm btn-ink" type="button" :disabled="busy === 'all'" @click="allOff"><AppIcon name="power" :size="12" />Tout éteindre</button>
      </template>
    </PageHeader>

    <main class="page">
      <p v-if="status" class="alert" :class="status.tone">{{ status.text }}</p>

      <!-- Non connecté -->
      <section v-if="!home?.connected" class="card mx-auto flex max-w-[520px] flex-col items-center gap-3 rounded-xl p-6 text-center">
        <span class="inline-flex size-[72px] items-center justify-center rounded-xl bg-warning-soft text-warning-bright"><AppIcon name="lightbulb" :size="28" /></span>
        <h2>Reliez vos lampes Philips Hue</h2>
        <p class="text-xs text-muted">Pilotez vos pièces et scènes depuis DashIA, par la discussion (« éteins le salon »), le panel ou un tag NFC.</p>
        <ol class="flex flex-col gap-1.5 text-left text-xs text-muted">
          <li><strong>1.</strong> Connectez-vous avec votre compte Philips Hue.</li>
          <li><strong>2.</strong> DashIA appaire votre pont automatiquement.</li>
          <li><strong>3.</strong> Vos pièces apparaissent ici. Les lumières ne demandent pas de validation, et chaque action est annulable.</li>
        </ol>
        <a v-if="hueConnector?.available" class="btn btn-primary btn-xl btn-block btn-shadow" href="/api/connectors/hue/connect">Connecter Philips Hue</a>
        <p v-else class="alert alert-warning">Le connecteur Hue n'est pas configuré sur le serveur (HUE_CLIENT_ID / HUE_CLIENT_SECRET, voir le README).</p>
      </section>

      <template v-else>
        <section v-if="home.scenes.length" class="flex flex-col gap-3">
          <h2>Scènes{{ selectedRoom ? ` · ${selectedRoom.name}` : '' }}</h2>
          <div class="chips">
            <button v-for="item in roomScenes" :key="item.id" class="chip" type="button" :disabled="busy === item.id" @click="scene(item.id, item.name)">
              <AppIcon name="book-open" :size="12" />{{ item.name }}
            </button>
            <span v-if="!roomScenes.length" class="text-xs text-muted">Aucune scène pour cette pièce.</span>
          </div>
        </section>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section class="flex flex-col gap-3">
            <h2>Pièces</h2>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
              <HomeRoomTile
                v-for="room in rooms"
                :key="room.id"
                :room="room"
                :busy="busy === room.id"
                :selected="selectedRoom?.id === room.id"
                @toggle="toggleRoom(room)"
                @select="selectedRoomId = room.id"
              />
            </div>
            <template v-if="zones.length">
              <h2>Zones</h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                <HomeRoomTile v-for="zone in zones" :key="zone.id" :room="zone" :busy="busy === zone.id" @toggle="toggleRoom(zone)" />
              </div>
            </template>
            <div v-if="!rooms.length" class="empty-state">
              <span class="icon-tile tone-warning"><AppIcon name="lightbulb" :size="16" /></span>
              <strong>Aucune pièce</strong>
              <p>Créez des pièces dans l'app Philips Hue : elles apparaîtront ici.</p>
            </div>
          </section>

          <section v-if="selectedRoom" class="card flex flex-col gap-4">
            <div class="flex items-center justify-between gap-2">
              <h2>{{ selectedRoom.name }}</h2>
              <button class="switch" type="button" role="switch" :aria-checked="selectedRoom.on" :aria-label="`Allumer ${selectedRoom.name}`" @click="toggleRoom(selectedRoom)" />
            </div>
            <label class="field">
              <span class="field-label">Luminosité · {{ selectedRoom.brightness ?? 0 }} %</span>
              <input class="m-0.5 w-full accent-primary" type="range" min="1" max="100" :value="selectedRoom.brightness ?? 50" :disabled="!selectedRoom.on" @input="onDim">
            </label>
            <ul class="flex flex-col gap-3">
              <li v-for="light in selectedRoom.lights" :key="light.id" class="flex items-center gap-2.5" :class="{ 'opacity-50': !light.reachable }">
                <AppIcon name="lightbulb" :size="14" :class="light.on ? 'text-warning-bright' : 'text-muted'" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <strong class="font-bold">{{ light.name }}</strong>
                  <span class="text-2xs text-muted">{{ !light.reachable ? 'Injoignable' : light.on ? `Allumée${light.brightness ? ` · ${light.brightness} %` : ''}` : 'Éteinte' }}</span>
                </span>
                <button class="switch" type="button" role="switch" :aria-checked="light.on" :disabled="!light.reachable || busy === light.id" :aria-label="`Allumer ${light.name}`" @click="toggleLight(light)" />
              </li>
            </ul>
          </section>
        </div>

        <button class="text-btn self-center text-muted" type="button" @click="disconnect">Déconnecter Philips Hue</button>
      </template>
    </main>
    <HomeToast />
  </div>
</template>
