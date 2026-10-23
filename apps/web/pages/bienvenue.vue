<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Bienvenue · DashIA' });

const { me, refresh } = useMe();
const push = usePush();
const step = ref(0);
const busy = ref(false);
const message = ref<string | null>(null);

onMounted(() => refresh().catch(() => {}));

const firstName = computed(() => me.value?.user.name.split(' ')[0] ?? '');

interface Step {
  title: string;
  text: string;
  cta: string;
  action?: () => Promise<void>;
}

const steps = computed<Step[]>(() => [
  {
    title: `Bienvenue ${firstName.value} 👋\nOn fait le tour ensemble ?`,
    text: "1 minute pour connecter votre agent et régler l'essentiel. Vous pourrez tout modifier plus tard.",
    cta: 'Commencer la visite',
  },
  {
    title: 'Restez informé,\nsans être dérangé',
    text: "Les actions à valider, vos rappels et le résumé du matin arrivent en notification. Sur iPhone, installez d'abord l'app sur l'écran d'accueil.",
    cta: push.subscribed.value ? 'Notifications activées ✓' : 'Activer les notifications',
    action: async () => {
      if (!push.supported.value || push.subscribed.value) return;
      await push.subscribe();
    },
  },
  {
    title: 'Déposez un premier\ndocument',
    text: "Facture, contrat, attestation… votre agent l'analyse sur votre PC : résumé, dates, montants et suggestions.",
    cta: 'Ouvrir le drive',
    action: async () => {
      await navigateTo('/drive');
    },
  },
  {
    title: 'Branchez votre\nquotidien',
    text: 'Connectez Google Agenda pour le planning, puis Philips Hue pour la maison, depuis les réglages.',
    cta: 'Terminer',
    action: async () => {
      await navigateTo('/');
    },
  },
]);

const current = computed(() => steps.value[step.value]!);

async function next() {
  message.value = null;
  busy.value = true;
  try {
    await current.value.action?.();
    if (step.value < steps.value.length - 1 && !['Ouvrir le drive', 'Terminer'].includes(current.value.cta)) step.value++;
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : 'Action impossible pour le moment.';
  } finally {
    busy.value = false;
  }
}

function skip() {
  if (step.value < steps.value.length - 1) step.value++;
  else void navigateTo('/');
}

const features = [
  { icon: 'plug', label: 'Connexion à votre PC en local' },
  { icon: 'face-smile', label: 'Face ID pour valider les actions' },
  { icon: 'bell', label: 'Notifications utiles, jamais de spam' },
] as const;
</script>

<template>
  <header class="flex items-center justify-between pt-[58px] pb-2.5">
    <span class="mx-auto pl-12 text-xs font-extrabold text-muted">Étape {{ step + 1 }} sur {{ steps.length }}</span>
    <button class="text-btn text-sm leading-4 text-muted" type="button" @click="navigateTo('/')">Passer</button>
  </header>

  <div class="mt-5 flex gap-1.5" aria-hidden="true">
    <span v-for="(_, index) in steps" :key="index" class="h-1.5 flex-1 rounded-full" :class="index <= step ? 'bg-primary' : 'bg-border'" />
  </div>

  <section class="flex-1 pt-10">
    <div class="relative mx-auto flex size-44 items-center justify-center rounded-2xl border bg-surface" aria-hidden="true">
      <span class="inline-flex size-24 items-center justify-center rounded-xl bg-ink text-on-ink"><AppIcon name="microchip" :size="36" /></span>
      <span class="absolute inline-flex items-center gap-1 rounded-md border bg-surface px-[11px] py-[7px] text-2xs font-bold drop-shadow-xs top-6 -left-4"><AppIcon name="calendar" :size="11" class="text-info" />Planning</span>
      <span class="absolute inline-flex items-center gap-1 rounded-md border bg-surface px-[11px] py-[7px] text-2xs font-bold drop-shadow-xs top-16 -right-6"><AppIcon name="file-lines" :size="11" class="text-primary" />Drive</span>
      <span class="absolute inline-flex items-center gap-1 rounded-md border bg-surface px-[11px] py-[7px] text-2xs font-bold drop-shadow-xs -bottom-3 -left-2"><AppIcon name="lightbulb" :size="11" class="text-warning-bright" />Maison</span>
    </div>

    <h1 class="mt-10 text-[26px] leading-[32.5px] tracking-[-0.65px] whitespace-pre-line">{{ current.title }}</h1>
    <p class="mt-2 text-muted">{{ current.text }}</p>

    <ul v-if="step === 0" class="mt-6 flex flex-col gap-3">
      <li v-for="feature in features" :key="feature.label" class="flex items-center gap-3 font-semibold">
        <span class="icon-tile tone-primary size-8 rounded-sm"><AppIcon :name="feature.icon" :size="12" /></span>
        <span>{{ feature.label }}</span>
      </li>
    </ul>
    <p v-if="message" class="alert alert-error mt-4">{{ message }}</p>
  </section>

  <footer class="flex flex-col gap-2 pt-4">
    <button class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="busy" @click="next">
      <span v-if="busy" class="spinner" />{{ current.cta }}
    </button>
    <button class="btn btn-ghost btn-block" type="button" @click="skip">Plus tard</button>
  </footer>
</template>
