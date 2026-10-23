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

const BUTTON = 'inline-flex min-h-14 cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-center text-[16px] font-extrabold';
const BUTTON_LIGHT = `${BUTTON} bg-white/10 text-white`;
const BUTTON_GO = `${BUTTON} bg-emerald text-night`;
const STATE_ICON = 'mb-4 inline-flex size-24 items-center justify-center rounded-full';
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden bg-linear-to-b/srgb from-emerald-dark to-night px-[max(24px,calc((100%_-_480px)/2))] pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-white">
    <span class="absolute -top-20 -right-20 size-64 rounded-full bg-emerald/20 blur-[32px]" aria-hidden="true" />
    <p class="flex items-center gap-2 text-xs font-bold text-white/70"><AppIcon name="nfc" :size="12" />Tag « {{ data?.tag.name ?? '…' }} »</p>

    <template v-if="loadError">
      <div class="flex flex-col items-center gap-2 pt-10 text-center">
        <span :class="[STATE_ICON, 'bg-rose text-white']"><AppIcon name="xmark" :size="28" /></span>
        <h1 class="text-2xl">Ce tag n'est pas reconnu</h1>
        <p class="text-white/60">Il a été désactivé, ou il appartient à un autre compte.</p>
      </div>
      <div class="mt-auto grid grid-cols-[1fr] gap-3 pt-8"><NuxtLink to="/" :class="BUTTON_LIGHT">Retour à l'accueil</NuxtLink></div>
    </template>

    <template v-else-if="data && !data.routine">
      <div class="flex flex-col items-center gap-2 pt-10 text-center">
        <span :class="[STATE_ICON, 'bg-emerald text-night']"><AppIcon name="repeat" :size="28" /></span>
        <h1 class="text-2xl">Aucune routine associée</h1>
        <p class="text-white/60">Choisissez la routine que ce tag doit lancer.</p>
      </div>
      <div class="mt-auto grid grid-cols-[1fr] gap-3 pt-8"><NuxtLink to="/tags" :class="BUTTON_GO">Associer une routine</NuxtLink></div>
    </template>

    <template v-else-if="data?.routine">
      <div class="flex flex-col items-center gap-2 pt-10 text-center">
        <div v-if="phase === 'countdown' || phase === 'running'" class="relative mb-4 size-40 [&_circle]:transition-[stroke-dashoffset] [&_circle]:duration-1000 [&_circle]:ease-linear">
          <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="72" fill="none" class="stroke-white/10" stroke-width="8" />
            <circle cx="80" cy="80" r="72" fill="none" class="stroke-emerald" stroke-width="8" stroke-linecap="round" :stroke-dasharray="CIRCUMFERENCE" :stroke-dashoffset="CIRCUMFERENCE * (1 - progress)" transform="rotate(-90 80 80)" />
          </svg>
          <span class="absolute inset-0 flex flex-col items-center justify-center">
            <template v-if="phase === 'running'"><span class="spinner size-10 border-4 text-emerald" /></template>
            <template v-else><strong class="text-5xl font-extrabold">{{ remaining }}</strong><span class="text-[11px] font-bold text-white/60">secondes</span></template>
          </span>
        </div>
        <span v-else-if="phase === 'done'" :class="[STATE_ICON, error || run?.status === 'failed' ? 'bg-rose text-white' : run?.status === 'partial' ? 'bg-amber text-night' : 'bg-emerald text-night']">
          <AppIcon :name="error || run?.status === 'failed' ? 'xmark' : run?.status === 'partial' ? 'circle-half' : 'check'" :size="28" />
        </span>
        <span v-else :class="[STATE_ICON, 'bg-emerald text-night']"><AppIcon name="ban" :size="28" /></span>

        <h1 class="text-2xl">{{ data.routine.name }}</h1>
        <p class="text-white/60">
          <template v-if="phase === 'countdown'">Lancement automatique…</template>
          <template v-else-if="phase === 'running'">En cours…</template>
          <template v-else-if="phase === 'cancelled'">Annulé : rien n'a été fait.</template>
          <template v-else-if="error">{{ error }}</template>
          <template v-else>{{ done }}/{{ run?.steps.length }} action{{ done > 1 ? 's' : '' }} effectuée{{ done > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <ul class="mt-8 flex flex-col gap-2.5">
        <li v-for="(step, index) in data.routine.steps" :key="index" :class="[run?.steps[index]?.status, run?.steps[index]?.status === 'failed' ? 'bg-rose/20' : 'bg-white/5']" class="flex items-center gap-3 rounded-md px-4 py-3">
          <AppIcon :name="STEP_ICONS[step.type] ?? 'check'" :size="14" />
          <span class="min-w-0 flex-1">{{ step.label }}</span>
          <AppIcon v-if="run?.steps[index]" :name="run.steps[index]!.status === 'failed' ? 'xmark' : 'check'" :size="12" />
        </li>
      </ul>

      <div class="mt-auto grid grid-cols-[1fr_1.4fr] gap-3 pt-8">
        <template v-if="phase === 'countdown'">
          <button :class="BUTTON_LIGHT" type="button" @click="cancel">Annuler</button>
          <button :class="BUTTON_GO" type="button" @click="launch">Lancer maintenant</button>
        </template>
        <template v-else-if="phase === 'cancelled'">
          <NuxtLink to="/" :class="BUTTON_LIGHT">Accueil</NuxtLink>
          <button :class="BUTTON_GO" type="button" @click="launch">Lancer quand même</button>
        </template>
        <template v-else-if="phase === 'done'">
          <NuxtLink to="/journal" :class="BUTTON_LIGHT">Journal</NuxtLink>
          <NuxtLink :to="openUrl ?? '/'" :class="BUTTON_GO">{{ openUrl ? 'Voir la réponse' : 'Terminé' }}</NuxtLink>
        </template>
      </div>
    </template>
  </div>
</template>
