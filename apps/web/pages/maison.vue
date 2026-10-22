<script setup lang="ts">
useHead({ title: 'Maison · DashIA' });

const route = useRoute();
const { home, loading, busy, refresh, toggleRoom, dimRoom, allOff, scene, toggleLight, lightsOn } = useHome();
const { data: connectorsData } = await useFetch('/api/connectors', { key: 'connectors' });
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
  if (!confirm('Déconnecter Philips Hue ?')) return;
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
      <section v-if="!home?.connected" class="card connect">
        <span class="bulb"><AppIcon name="lightbulb" :size="28" /></span>
        <h2>Reliez vos lampes Philips Hue</h2>
        <p class="muted small">Pilotez vos pièces et scènes depuis DashIA, par la discussion (« éteins le salon »), le panel ou un tag NFC.</p>
        <ol class="steps small">
          <li><strong>1.</strong> Connectez-vous avec votre compte Philips Hue.</li>
          <li><strong>2.</strong> DashIA appaire votre pont automatiquement.</li>
          <li><strong>3.</strong> Vos pièces apparaissent ici. Les lumières ne demandent pas de validation, et chaque action est annulable.</li>
        </ol>
        <a v-if="hueConnector?.available" class="btn btn-primary btn-xl btn-block btn-shadow" href="/api/connectors/hue/connect">Connecter Philips Hue</a>
        <p v-else class="alert alert-warning">Le connecteur Hue n'est pas configuré sur le serveur (HUE_CLIENT_ID / HUE_CLIENT_SECRET, voir le README).</p>
      </section>

      <template v-else>
        <section v-if="home.scenes.length" class="section">
          <h2>Scènes{{ selectedRoom ? ` · ${selectedRoom.name}` : '' }}</h2>
          <div class="chips">
            <button v-for="item in roomScenes" :key="item.id" class="chip" type="button" :disabled="busy === item.id" @click="scene(item.id, item.name)">
              <AppIcon name="book-open" :size="12" />{{ item.name }}
            </button>
            <span v-if="!roomScenes.length" class="small muted">Aucune scène pour cette pièce.</span>
          </div>
        </section>

        <div class="home-layout">
          <section class="section">
            <h2>Pièces</h2>
            <div class="rooms">
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
              <div class="rooms">
                <HomeRoomTile v-for="zone in zones" :key="zone.id" :room="zone" :busy="busy === zone.id" @toggle="toggleRoom(zone)" />
              </div>
            </template>
            <div v-if="!rooms.length" class="empty-state">
              <span class="icon-tile tone-warning"><AppIcon name="lightbulb" :size="16" /></span>
              <strong>Aucune pièce</strong>
              <p>Créez des pièces dans l'app Philips Hue : elles apparaîtront ici.</p>
            </div>
          </section>

          <section v-if="selectedRoom" class="card detail">
            <div class="row between">
              <h2>{{ selectedRoom.name }}</h2>
              <button class="switch" type="button" role="switch" :aria-checked="selectedRoom.on" :aria-label="`Allumer ${selectedRoom.name}`" @click="toggleRoom(selectedRoom)" />
            </div>
            <label class="field">
              <span class="field-label">Luminosité · {{ selectedRoom.brightness ?? 0 }} %</span>
              <input class="range" type="range" min="1" max="100" :value="selectedRoom.brightness ?? 50" :disabled="!selectedRoom.on" @input="onDim">
            </label>
            <ul class="lights">
              <li v-for="light in selectedRoom.lights" :key="light.id" :class="{ off: !light.reachable }">
                <AppIcon name="lightbulb" :size="14" :class="light.on ? 'lit' : 'muted'" />
                <span class="grow">
                  <strong>{{ light.name }}</strong>
                  <span class="tiny muted">{{ !light.reachable ? 'Injoignable' : light.on ? `Allumée${light.brightness ? ` · ${light.brightness} %` : ''}` : 'Éteinte' }}</span>
                </span>
                <button class="switch" type="button" role="switch" :aria-checked="light.on" :disabled="!light.reachable || busy === light.id" :aria-label="`Allumer ${light.name}`" @click="toggleLight(light)" />
              </li>
            </ul>
          </section>
        </div>

        <button class="text-btn disconnect" type="button" @click="disconnect">Déconnecter Philips Hue</button>
      </template>
    </main>
    <HomeToast />
  </div>
</template>

<style scoped>
.connect {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 520px;
  margin: 0 auto;
  padding: 24px;
  text-align: center;
  border-radius: var(--radius-xl);
}

.bulb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-xl);
  background: var(--warning-soft);
  color: var(--warning-bright);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  color: var(--text-muted);
}

.home-layout {
  display: grid;
  gap: 16px;
}

.rooms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.range {
  width: 100%;
  accent-color: var(--primary);
}

.lights {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lights li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lights li.off {
  opacity: 0.5;
}

.lights .grow {
  display: flex;
  flex-direction: column;
}

.lights strong {
  font-weight: 700;
}

.lit {
  color: var(--warning-bright);
}

.disconnect {
  align-self: center;
  color: var(--text-muted);
}

@media (min-width: 1024px) {
  .home-layout {
    grid-template-columns: minmax(0, 1fr) 360px;
    align-items: start;
  }
}
</style>
