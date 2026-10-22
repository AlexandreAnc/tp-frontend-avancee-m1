<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api';
import type { IconName } from '~/utils/icons';

definePageMeta({ layout: 'blank' });
useHead({ title: 'Tag NFC · DashIA' });

/** Écran ouvert au tap d'un tag : compte à rebours, puis lancement de la routine associée. */
const route = useRoute();
const publicId = route.params.publicId as string;
const COUNTDOWN_SECONDS = 2;

const { data, error: loadError } = await useFetch<ApiResponse<'/api/tags/scan/:publicId', 'get'>>(`/api/tags/scan/${publicId}`, { key: `tag-${publicId}` });
const remaining = ref(COUNTDOWN_SECONDS);
const phase = ref<'countdown' | 'running' | 'done' | 'cancelled'>('countdown');
const run = ref<ApiResponse<'/api/tags/scan/:publicId', 'post'>['run']>(null);
const error = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

const STEP_ICONS: Record<string, IconName> = {
  'hue.set_room': 'lightbulb',
  'hue.activate_scene': 'book-open',
  reminder: 'bell',
  notify: 'paper-plane',
  agent: 'microchip',
};

async function launch() {
  clearInterval(timer);
  phase.value = 'running';
  try {
    const result = await $fetch<ApiResponse<'/api/tags/scan/:publicId', 'post'>>(`/api/tags/scan/${publicId}`, { method: 'POST' });
    run.value = result.run;
    phase.value = 'done';
  } catch (caught) {
    error.value = getErrorMessage(caught);
    phase.value = 'done';
  }
}

function cancel() {
  clearInterval(timer);
  phase.value = 'cancelled';
}

onMounted(() => {
  if (!data.value?.routine) return;
  timer = setInterval(() => {
    remaining.value -= 1;
    if (remaining.value <= 0) void launch();
  }, 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const done = computed(() => run.value?.steps.filter((step) => step.status !== 'failed').length ?? 0);
const openUrl = computed(() => run.value?.steps.find((step) => step.openUrl)?.openUrl ?? null);
const progress = computed(() => 1 - remaining.value / COUNTDOWN_SECONDS);
const CIRCUMFERENCE = 2 * Math.PI * 72;
</script>

<template>
  <div class="tap">
    <span class="glow" aria-hidden="true" />
    <p class="source small"><AppIcon name="nfc" :size="12" />Tag « {{ data?.tag.name ?? '…' }} »</p>

    <template v-if="loadError">
      <div class="center-block">
        <span class="state-icon danger"><AppIcon name="xmark" :size="28" /></span>
        <h1>Ce tag n'est pas reconnu</h1>
        <p class="sub">Il a été désactivé, ou il appartient à un autre compte.</p>
      </div>
      <div class="buttons single"><NuxtLink to="/" class="btn-light">Retour à l'accueil</NuxtLink></div>
    </template>

    <template v-else-if="data && !data.routine">
      <div class="center-block">
        <span class="state-icon"><AppIcon name="repeat" :size="28" /></span>
        <h1>Aucune routine associée</h1>
        <p class="sub">Choisissez la routine que ce tag doit lancer.</p>
      </div>
      <div class="buttons single"><NuxtLink to="/tags" class="btn-go">Associer une routine</NuxtLink></div>
    </template>

    <template v-else-if="data?.routine">
      <div class="center-block">
        <div v-if="phase === 'countdown' || phase === 'running'" class="countdown">
          <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="72" fill="none" stroke="rgb(255 255 255 / 0.1)" stroke-width="8" />
            <circle cx="80" cy="80" r="72" fill="none" stroke="#10b981" stroke-width="8" stroke-linecap="round" :stroke-dasharray="CIRCUMFERENCE" :stroke-dashoffset="CIRCUMFERENCE * (1 - progress)" transform="rotate(-90 80 80)" />
          </svg>
          <span class="count">
            <template v-if="phase === 'running'"><span class="spinner big" /></template>
            <template v-else><strong>{{ remaining }}</strong><span>secondes</span></template>
          </span>
        </div>
        <span v-else-if="phase === 'done'" class="state-icon" :class="{ danger: error || run?.status === 'failed', partial: run?.status === 'partial' }">
          <AppIcon :name="error || run?.status === 'failed' ? 'xmark' : run?.status === 'partial' ? 'circle-half' : 'check'" :size="28" />
        </span>
        <span v-else class="state-icon"><AppIcon name="ban" :size="28" /></span>

        <h1>{{ data.routine.name }}</h1>
        <p class="sub">
          <template v-if="phase === 'countdown'">Lancement automatique…</template>
          <template v-else-if="phase === 'running'">En cours…</template>
          <template v-else-if="phase === 'cancelled'">Annulé : rien n'a été fait.</template>
          <template v-else-if="error">{{ error }}</template>
          <template v-else>{{ done }}/{{ run?.steps.length }} action{{ done > 1 ? 's' : '' }} effectuée{{ done > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <ul class="steps">
        <li v-for="(step, index) in data.routine.steps" :key="index" :class="run?.steps[index]?.status">
          <AppIcon :name="STEP_ICONS[step.type] ?? 'check'" :size="14" />
          <span class="grow">{{ step.label }}</span>
          <AppIcon v-if="run?.steps[index]" :name="run.steps[index]!.status === 'failed' ? 'xmark' : 'check'" :size="12" />
        </li>
      </ul>

      <div class="buttons">
        <template v-if="phase === 'countdown'">
          <button class="btn-light" type="button" @click="cancel">Annuler</button>
          <button class="btn-go" type="button" @click="launch">Lancer maintenant</button>
        </template>
        <template v-else-if="phase === 'cancelled'">
          <NuxtLink to="/" class="btn-light">Accueil</NuxtLink>
          <button class="btn-go" type="button" @click="launch">Lancer quand même</button>
        </template>
        <template v-else-if="phase === 'done'">
          <NuxtLink to="/journal" class="btn-light">Journal</NuxtLink>
          <NuxtLink :to="openUrl ?? '/'" class="btn-go">{{ openUrl ? 'Voir la réponse' : 'Terminé' }}</NuxtLink>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tap {
  position: relative;
  overflow: hidden;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: max(24px, env(safe-area-inset-top)) max(24px, calc((100% - 480px) / 2)) max(24px, env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #064e3b, #1c1f23);
  color: #fff;
}

.glow {
  position: absolute;
  top: -80px;
  right: -80px;
  width: 256px;
  height: 256px;
  border-radius: 50%;
  background: rgb(16 185 129 / 0.2);
  filter: blur(32px);
}

.source {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(255 255 255 / 0.7);
  font-weight: 700;
}

.center-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 40px;
  text-align: center;
}

.countdown {
  position: relative;
  width: 160px;
  height: 160px;
  margin-bottom: 16px;
}

.countdown circle {
  transition: stroke-dashoffset 1s linear;
}

.count {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.count strong {
  font-size: 48px;
  line-height: 48px;
  font-weight: 800;
}

.count span {
  font-size: 11px;
  font-weight: 700;
  color: rgb(255 255 255 / 0.6);
}

.spinner.big {
  width: 40px;
  height: 40px;
  border-width: 4px;
  color: #10b981;
}

.state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  margin-bottom: 16px;
  border-radius: 50%;
  background: #10b981;
  color: #1c1f23;
}

.state-icon.partial {
  background: #fbbf24;
}

.state-icon.danger {
  background: #e11d48;
  color: #fff;
}

h1 {
  font-size: 24px;
  line-height: 32px;
}

.sub {
  color: rgb(255 255 255 / 0.6);
}

.steps {
  list-style: none;
  margin: 32px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.steps li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius);
  background: rgb(255 255 255 / 0.05);
}

.steps li.failed {
  background: rgb(225 29 72 / 0.2);
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 12px;
  margin-top: auto;
  padding-top: 32px;
}

.buttons.single {
  grid-template-columns: 1fr;
}

.btn-light,
.btn-go {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 800;
  text-align: center;
  cursor: pointer;
}

.btn-light {
  background: rgb(255 255 255 / 0.1);
  color: #fff;
}

.btn-go {
  background: #10b981;
  color: #1c1f23;
}
</style>
